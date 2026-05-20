/**
 * MyEquipment Page
 * Shows equipment assigned to the current user
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  TablePagination,
  Typography,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import assignmentService from '../services/assignment.service';
import { InventoryItem } from '../types/inventory.types';
import { AssignmentCard } from '../components/inventory/AssignmentCard';
import { AssignmentHistoryList } from '../components/inventory/AssignmentHistoryList';
import { useAuthStore } from '../store/authStore';
import { ResponsiveTable, Column } from '../components/responsive';

export const MyEquipment = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);

  useEffect(() => {
    loadMyEquipment(page, rowsPerPage);
  }, [page, rowsPerPage]);

  const loadMyEquipment = async (currentPage: number, currentLimit: number) => {
    if (equipment.length === 0) {
      setLoading(true);
    } else {
      setPageLoading(true);
    }
    setError(null);
    try {
      const response = await assignmentService.getMyEquipment(currentPage, currentLimit);
      setEquipment(response.data);
      setPagination(response.pagination);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load your equipment');
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
      active: 'success',
      available: 'success',
      assigned: 'info',
      maintenance: 'warning',
      storage: 'warning',
      disposed: 'error',
      lost: 'error',
      damaged: 'error',
    };
    return statusMap[status] || 'default';
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getConditionColor = (condition: string | null | undefined) => {
    if (!condition) return 'default';
    const conditionMap: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
      excellent: 'success',
      good: 'info',
      fair: 'warning',
      poor: 'warning',
      broken: 'error',
    };
    return conditionMap[condition] || 'default';
  };

  // Column definitions for ResponsiveTable
  const columns: Column<InventoryItem>[] = [
    {
      key: 'assetTag',
      label: 'Asset Tag',
      isPrimary: true,
      render: (item) => (
        <Typography variant="body2" fontWeight="medium">
          {item.assetTag}
        </Typography>
      ),
    },
    {
      key: 'name',
      label: 'Name',
      isSecondary: true,
      render: (item) => (
        <>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{item.name}</Typography>
          {item.serialNumber && (
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              S/N: {item.serialNumber}
            </Typography>
          )}
        </>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      hideOnMobile: true,
      render: (item) => <Typography variant="body2">{item.category?.name || 'N/A'}</Typography>,
    },
    {
      key: 'officeLocation',
      label: 'Location',
      hideOnMobile: true,
      render: (item) => (
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {item.officeLocation?.name || 'N/A'}
        </Typography>
      ),
    },
    {
      key: 'room',
      label: 'Room',
      hideOnMobile: true,
      render: (item) => (
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {item.room?.name || 'N/A'}
        </Typography>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => (
        <Chip label={item.status} size="small" color={getStatusColor(item.status)} />
      ),
    },
    {
      key: 'condition',
      label: 'Condition',
      hideOnMobile: true,
      render: (item) =>
        item.condition ? (
          <Chip label={item.condition} size="small" color={getConditionColor(item.condition)} variant="outlined" />
        ) : (
          <Typography variant="body2" color="text.secondary">N/A</Typography>
        ),
    },
    {
      key: 'assignmentSource',
      label: 'Assignment',
      hideOnMobile: true,
      render: (item) =>
        item.assignmentSource === 'user' || item.assignedToUserId === user?.id ? (
          <Chip label="Assigned" size="small" color="primary" />
        ) : (
          <Chip label={`My Room${item.room?.name ? `: ${item.room.name}` : ''}`} size="small" color="default" />
        ),
    },
    {
      key: 'updatedAt',
      label: 'Assigned Date',
      hideOnMobile: true,
      render: (item) => <Typography variant="body2">{formatDate(item.updatedAt)}</Typography>,
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          My Equipment
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Equipment assigned to you or your primary room
        </Typography>
      </Box>

          {/* Action Bar */}
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {pagination
                ? `Showing ${equipment.length} of ${pagination.total} items`
                : `${equipment.length} items`}
            </Typography>
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => loadMyEquipment(page, rowsPerPage)}
              disabled={loading || pageLoading}
            >
              Refresh
            </Button>
          </Box>

          {/* Error Message */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Loading State */}
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {/* Page-change loading indicator */}
          {pageLoading && <LinearProgress sx={{ mb: 1 }} />
          }

          {/* Equipment Table */}
          {!loading && equipment.length > 0 && (
            <Box>
              <ResponsiveTable<InventoryItem>
                columns={columns}
                rows={equipment}
                getRowKey={(item) => item.id}
                loading={false}
                emptyMessage="No equipment found."
                rowActions={(item) => (
                  <Stack direction="row" spacing={1} justifyContent="center">
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedItem(item);
                          setShowHistory(false);
                        }}
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="View History">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedItem(item);
                          setShowHistory(true);
                        }}
                      >
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              />
            <TablePagination
              component="div"
              count={pagination?.total ?? 0}
              page={page - 1}
              onPageChange={(_, newPage) => setPage(newPage + 1)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(1);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
            </Box>
          )}

          {/* Empty State */}
          {!loading && equipment.length === 0 && !error && (
            <Card>
              <CardContent>
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No Equipment Assigned
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    You currently have no equipment assigned to you or your primary room.
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Selected Item Details */}
          {selectedItem && !showHistory && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Assignment Details: {selectedItem.name}
              </Typography>
              <AssignmentCard equipment={selectedItem} compact />
            </Box>
          )}

          {/* Selected Item History */}
          {selectedItem && showHistory && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Assignment History: {selectedItem.name}
              </Typography>
              <AssignmentHistoryList equipmentId={selectedItem.id} limit={20} />
            </Box>
          )}
    </Box>
  );
};

export default MyEquipment;
