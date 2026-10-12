import Select from '@mui/material/Select';
import type { SelectProps } from '@mui/material/Select';

/**
 * Drop-in replacement for a native `<select className="form-select">`.
 * The closed control mirrors `.form-select`; the open popup is MUI's Menu, so
 * it inherits the dropdown styling from the theme. Children are `<MenuItem>`s.
 * `displayEmpty` defaults to true so an `<MenuItem value="">` placeholder
 * renders like a native empty `<option>`.
 */
export default function PlainSelect<T = unknown>({ sx, ...props }: SelectProps<T>) {
  return (
    <Select<T>
      displayEmpty
      size="small"
      fullWidth
      {...props}
      sx={{
        fontSize: '0.875rem',
        borderRadius: 'var(--radius-md)',
        '& .MuiSelect-select': { padding: '0.625rem 1rem' },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--slate-300)' },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--slate-400)' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: 'var(--primary-blue)',
          borderWidth: 1,
        },
        '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)' },
        ...sx,
      }}
    />
  );
}
