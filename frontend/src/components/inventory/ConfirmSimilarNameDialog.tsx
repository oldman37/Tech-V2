import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

interface ConfirmSimilarNameDialogProps {
  open: boolean;
  /** What the user typed. */
  typedName: string;
  /** The existing record that looks like a match. */
  existingName: string;
  onUseExisting: () => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}

/**
 * Layer 2 of the duplicate guard: a near match (Levenshtein <= 2) is almost always a
 * typo, but not always — so ask rather than silently picking either outcome.
 */
export default function ConfirmSimilarNameDialog({
  open,
  typedName,
  existingName,
  onUseExisting,
  onCreateAnyway,
  onCancel,
}: ConfirmSimilarNameDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Did you mean {existingName}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          <strong>{existingName}</strong> already exists and is very close to{' '}
          <strong>{typedName}</strong>. Creating both would split reporting between them.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onCreateAnyway}>Create "{typedName}" anyway</Button>
        <Button variant="contained" onClick={onUseExisting}>
          Use {existingName}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
