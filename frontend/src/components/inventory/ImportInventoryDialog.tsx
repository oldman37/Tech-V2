/**
 * ImportInventoryDialog Component
 * Excel file upload dialog for importing inventory items
 */

import { useState, useRef, DragEvent } from 'react';
import api from '../../services/api';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Chip,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';

interface ImportInventoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv', // .csv
  'text/plain', // .csv (some OS/browser combos report this)
];

interface ImportResult {
  jobId: string;
  successCount: number;
  errorCount: number;
  errors?: Array<{ row: number; error: string }>;
  message?: string;
}

const ImportInventoryDialog = ({
  open,
  onClose,
  onSuccess,
}: ImportInventoryDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setFile(null);
    setUploading(false);
    setError(null);
    setResult(null);
    setDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    setResult(null);

    // Validate file type
    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
    const isValidExt = ['xlsx', 'xls', 'csv'].includes(fileExt || '');
    if (!ALLOWED_TYPES.includes(selectedFile.type) && !isValidExt) {
      setError('Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file');
      return;
    }

    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File size exceeds 10MB limit');
      return;
    }

    setFile(selectedFile);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Create FormData to send file
      const formData = new FormData();
      formData.append('file', file);

      // Use the shared axios instance so the CSRF token interceptor fires automatically.
      // Do NOT set Content-Type manually — axios sets it with the correct multipart boundary.
      const response = await api.post('/inventory/import', formData, {
        headers: { 'Content-Type': undefined },
      });

      const data = response.data;
      setResult(data);

      // Only auto-close if fully successful (no errors) — otherwise keep the
      // dialog open so the user can read what went wrong.
      if (data.successCount > 0 && !data.errorCount) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } else if (data.successCount > 0 && data.errorCount > 0) {
        // Partial success — refresh the list but leave dialog open for review
        onSuccess();
      }
    } catch (err: any) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to upload file';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    // TODO: Implement template download
    console.log('Download template');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Import Inventory
        <Typography variant="body2" color="text.secondary">
          Upload an Excel (.xlsx, .xls) or CSV (.csv) file to import multiple inventory items
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {result && (
          <Alert
            severity={result.errorCount > 0 ? 'warning' : 'success'}
            sx={{ mb: 2 }}
            icon={result.errorCount > 0 ? <ErrorIcon /> : <SuccessIcon />}
          >
            <Typography variant="body2">
              <strong>Import Complete:</strong> {result.successCount} items imported successfully
              {result.errorCount > 0 && `, ${result.errorCount} errors`}
            </Typography>
            {result.message && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                {result.message}
              </Typography>
            )}
          </Alert>
        )}

        {result?.errors && result.errors.length > 0 && (
          <Paper variant="outlined" sx={{ mb: 2, maxHeight: 200, overflow: 'auto' }}>
            <List dense>
              {result.errors.map((err, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={`Row ${err.row}: ${err.error}`}
                    primaryTypographyProps={{
                      variant: 'caption',
                      color: 'error',
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}

        {/* File Upload Area */}
        <Box
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: dragActive ? 'primary.main' : 'grey.300',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            bgcolor: dragActive ? 'action.hover' : 'background.paper',
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            },
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />

          {file ? (
            <Box>
              <Chip
                label={file.name}
                onDelete={handleReset}
                color="primary"
                icon={<SuccessIcon />}
                sx={{ mb: 1 }}
              />
              <Typography variant="caption" display="block" color="text.secondary">
                {(file.size / 1024).toFixed(2)} KB
              </Typography>
            </Box>
          ) : (
            <Box>
              <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="body1" gutterBottom>
                Drag and drop Excel or CSV file here
              </Typography>
              <Typography variant="caption" color="text.secondary">
                or click to select file
              </Typography>
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                Supports .xlsx, .xls, and .csv files (max 10MB)
              </Typography>
            </Box>
          )}
        </Box>

        {/* Progress Bar */}
        {uploading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="indeterminate" />
            <Typography variant="caption" color="text.secondary" align="center" display="block">
              Uploading and processing...
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Template Download */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            Need a template?
          </Typography>
          <Button
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadTemplate}
            disabled={uploading}
          >
            Download Template
          </Button>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={uploading}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        <Button
          onClick={handleUpload}
          variant="contained"
          disabled={!file || uploading}
          startIcon={<UploadIcon />}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportInventoryDialog;
