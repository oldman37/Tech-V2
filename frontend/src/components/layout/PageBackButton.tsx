import { Button } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';

interface PageBackButtonProps {
  /** Button label. Defaults to "Back". */
  label?: string;
  /** Custom click handler. Overrides default navigation when provided. */
  onClick?: () => void;
  /** Additional MUI sx props. */
  sx?: SxProps<Theme>;
}

export function PageBackButton({ label = 'Back', onClick, sx }: PageBackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(-1);
    }
  };

  return (
    <Button
      variant="text"
      startIcon={<ArrowBackIcon />}
      onClick={handleClick}
      sx={sx}
    >
      {label}
    </Button>
  );
}
