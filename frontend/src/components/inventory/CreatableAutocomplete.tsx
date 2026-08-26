import { useMemo, useState } from 'react';
import { Autocomplete, TextField, createFilterOptions } from '@mui/material';
import { findNameMatch, normalizeName } from '../../utils/nameMatching';
import ConfirmSimilarNameDialog from './ConfirmSimilarNameDialog';

export interface NamedRecord {
  id: string;
  name: string;
}

/** The synthetic `+ Add "X"` entry. Never a real record. */
interface AddOption {
  __add: true;
  inputValue: string;
  id: string;
  name: string;
}

type Option<T extends NamedRecord> = T | AddOption;

const isAddOption = <T extends NamedRecord>(o: Option<T>): o is AddOption =>
  (o as AddOption).__add === true;

interface CreatableAutocompleteProps<T extends NamedRecord> {
  label: string;
  options: T[];
  value: T | null;
  onChange: (record: T | null) => void;
  /**
   * Perform the actual creation. Resolve with the created (or colliding) record.
   * Returning null leaves the field untouched — used when creation was cancelled,
   * e.g. the vendor dialog was dismissed.
   */
  onCreate: (name: string) => Promise<T | null>;
  disabled?: boolean;
  /** Shown when the list is empty and no Add entry applies. */
  noOptionsText?: string;
  helperText?: string;
  error?: boolean;
  /** Raised whenever the typed text changes, so the host can guard uncommitted input. */
  onInputTextChange?: (text: string) => void;
}

/**
 * An Autocomplete that can create a new record — but only ever through an explicit
 * `+ Add "X"` entry, never by typing alone.
 *
 * Plain MUI Autocompletes clear typed text on blur (clearOnBlur defaults to !freeSolo),
 * which reads as "the field erased what I typed". Turning on freeSolo alone is worse:
 * the text stays visible but is still never committed. Hence the explicit Add entry
 * plus the host-side uncommitted-text guard.
 */
export default function CreatableAutocomplete<T extends NamedRecord>({
  label,
  options,
  value,
  onChange,
  onCreate,
  disabled,
  noOptionsText,
  helperText,
  error,
  onInputTextChange,
}: CreatableAutocompleteProps<T>) {
  const [inputValue, setInputValue] = useState('');
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [nearMatch, setNearMatch] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);

  const baseFilter = useMemo(
    () =>
      createFilterOptions<Option<T>>({
        // Layer 1: match on the normalized name, so `delll` still surfaces `Dell`.
        stringify: (o) => `${o.name} ${normalizeName(o.name)}`,
      }),
    [],
  );

  const commitCreate = async (name: string) => {
    setCreating(true);
    try {
      const created = await onCreate(name);
      if (created) {
        onChange(created);
        setInputValue(created.name);
        onInputTextChange?.(created.name);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleAddChosen = async (typed: string) => {
    const { exact, near } = findNameMatch(typed, options);
    if (exact) {
      // Already exists under a different casing/punctuation — just select it.
      onChange(exact);
      setInputValue(exact.name);
      onInputTextChange?.(exact.name);
      return;
    }
    if (near) {
      setPendingName(typed);
      setNearMatch(near);
      return;
    }
    await commitCreate(typed);
  };

  return (
    <>
      <Autocomplete<Option<T>, false, false, false>
        fullWidth
        freeSolo={false}
        disabled={disabled || creating}
        options={options as Option<T>[]}
        value={value as Option<T> | null}
        inputValue={inputValue}
        onInputChange={(_e, text, reason) => {
          if (reason === 'reset' && value) {
            setInputValue(value.name);
            onInputTextChange?.(value.name);
            return;
          }
          setInputValue(text);
          onInputTextChange?.(text);
        }}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        noOptionsText={noOptionsText ?? `No ${label.toLowerCase()} found`}
        filterOptions={(opts, params) => {
          const filtered = baseFilter(opts, params);
          const typed = params.inputValue.trim();
          if (!typed) return filtered;

          // Suppress the Add entry when a normalized-exact match already exists —
          // there is nothing to create, and offering it invites a duplicate.
          const { exact } = findNameMatch(typed, options);
          if (exact) return filtered;

          return [
            ...filtered,
            { __add: true, inputValue: typed, id: `__add__${typed}`, name: `+ Add "${typed}"` } as AddOption,
          ];
        }}
        onChange={(_e, selected) => {
          // A raw string means the user typed and pressed Enter without picking
          // anything. Ignored outright — typing alone never creates a record.
          if (typeof selected === 'string') return;
          if (selected && isAddOption(selected)) {
            void handleAddChosen(selected.inputValue);
            return;
          }
          onChange(selected);
          setInputValue(selected?.name ?? '');
          onInputTextChange?.(selected?.name ?? '');
        }}
        renderInput={(params) => (
          <TextField {...params} label={label} error={error} helperText={helperText} />
        )}
      />

      <ConfirmSimilarNameDialog
        open={!!pendingName && !!nearMatch}
        typedName={pendingName ?? ''}
        existingName={nearMatch?.name ?? ''}
        onUseExisting={() => {
          if (nearMatch) {
            onChange(nearMatch);
            setInputValue(nearMatch.name);
            onInputTextChange?.(nearMatch.name);
          }
          setPendingName(null);
          setNearMatch(null);
        }}
        onCreateAnyway={() => {
          const name = pendingName;
          setPendingName(null);
          setNearMatch(null);
          if (name) void commitCreate(name);
        }}
        onCancel={() => {
          setPendingName(null);
          setNearMatch(null);
        }}
      />
    </>
  );
}
