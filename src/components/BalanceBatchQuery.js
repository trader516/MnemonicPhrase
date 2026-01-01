import React, { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip
} from '@mui/material';
import { Search, Refresh } from '@mui/icons-material';
import { ethers } from 'ethers';
import { isValidEthereumAddress, formatAddress } from '../utils/evmUtils';

const BASE_MAINNET_RPC = 'https://mainnet.base.org';
const DEFAULT_RPC_URL =
  (process.env.REACT_APP_DEFAULT_RPC_URL || '').trim() || BASE_MAINNET_RPC;
const DEFAULT_ADDRESS_TEXT = process.env.REACT_APP_BATCH_QUERY_ADDRESSES || '';

const DEFAULT_USDC_ADDRESS =
  process.env.REACT_APP_BASE_USDC_ADDRESS ||
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DEFAULT_ABAU_USDC_ADDRESS =
  process.env.REACT_APP_BASE_ABAU_USDC_ADDRESS ||
  '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';

const createProvider = (rpcUrl) => {
  const request = new ethers.FetchRequest(rpcUrl);
  request.setHeader('Content-Type', 'application/json');
  request.setHeader('Accept', 'application/json');
  return new ethers.JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
};

const TOKEN_DEFS = [
  {
    key: 'usdc',
    label: 'USDC',
    address: DEFAULT_USDC_ADDRESS,
    defaultDecimals: 6
  },
  {
    key: 'abauusdc',
    label: 'aBauUSDC',
    address: DEFAULT_ABAU_USDC_ADDRESS,
    defaultDecimals: 6
  }
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const extractAddresses = (input) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { addresses: [], invalidLines: [] };
  }

  const lines = trimmed.split(/\r?\n/);
  const addresses = [];
  const invalidLines = [];

  lines.forEach((line) => {
    const cleaned = line.trim();
    if (!cleaned) return;

    const matches = cleaned.match(/0x[a-fA-F0-9]{40}/g);
    if (!matches) {
      invalidLines.push(cleaned);
      return;
    }

    matches.forEach((match) => {
      if (!isValidEthereumAddress(match)) {
        invalidLines.push(match);
        return;
      }

      try {
        addresses.push(ethers.getAddress(match));
      } catch {
        addresses.push(match);
      }
    });
  });

  return { addresses: Array.from(new Set(addresses)), invalidLines };
};

const trimTrailingZeros = (value) => {
  if (!value) return '0';
  const [whole, fraction] = value.split('.');
  if (!fraction) return value;
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
};

const loadTokenMetadata = async (provider) => {
  const tokens = await Promise.all(
    TOKEN_DEFS.map(async (token) => {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
      let symbol = token.label;
      let decimals = token.defaultDecimals;

      try {
        const symbolValue = await contract.symbol();
        if (symbolValue) {
          symbol = symbolValue;
        }
      } catch {
        // Keep defaults.
      }

      try {
        const decimalsValue = await contract.decimals();
        const parsed = Number(decimalsValue);
        if (!Number.isNaN(parsed)) {
          decimals = parsed;
        }
      } catch {
        // Keep defaults.
      }

      return { ...token, symbol, decimals, contract };
    })
  );

  return tokens;
};

const BalanceBatchQuery = () => {
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [addressText, setAddressText] = useState(DEFAULT_ADDRESS_TEXT);
  const [invalidLines, setInvalidLines] = useState([]);
  const [results, setResults] = useState([]);
  const [tokenMeta, setTokenMeta] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const handleQuery = async () => {
    const rpc = rpcUrl.trim();
    if (!rpc) {
      setError('RPC URL is required.');
      return;
    }

    const { addresses, invalidLines: invalid } = extractAddresses(addressText);
    setInvalidLines(invalid);
    setError('');
    setResults([]);
    setProgress(0);
    setStatusMessage('');

    if (addresses.length === 0) {
      setError('No valid addresses found.');
      return;
    }

    const invalidTokens = TOKEN_DEFS.filter(
      (token) => !isValidEthereumAddress(token.address)
    );
    if (invalidTokens.length > 0) {
      setError(`Invalid token address: ${invalidTokens.map((t) => t.label).join(', ')}`);
      return;
    }

    setLoading(true);

    try {
      const provider = createProvider(rpc);

      setStatusMessage('Loading token metadata...');
      const tokens = await loadTokenMetadata(provider);
      setTokenMeta(tokens);

      setStatusMessage(`Querying ${addresses.length} addresses...`);
      const rows = [];

      for (let i = 0; i < addresses.length; i += 1) {
        const address = addresses[i];
        const balances = {};

        const balanceValues = await Promise.all(
          tokens.map(async (token) => {
            const value = await token.contract.balanceOf(address);
            return {
              key: token.key,
              value: trimTrailingZeros(ethers.formatUnits(value, token.decimals))
            };
          })
        );

        balanceValues.forEach((entry) => {
          balances[entry.key] = entry.value;
        });

        rows.push({ address, balances });
        setProgress(((i + 1) / addresses.length) * 100);
      }

      setResults(rows);
      setStatusMessage('');
    } catch (queryError) {
      console.error('Balance query failed:', queryError);
      setError(queryError?.message || 'Balance query failed.');
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResults([]);
    setInvalidLines([]);
    setError('');
    setProgress(0);
    setStatusMessage('');
  };

  const headerTokens = tokenMeta.length > 0 ? tokenMeta : TOKEN_DEFS;

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Batch Balance Query
      </Typography>

      <Typography variant="body2" color="textSecondary" paragraph>
        Query Base chain balances for USDC and aBauUSDC.
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary">
          Token contracts
        </Typography>
        {TOKEN_DEFS.map((token) => (
          <Typography
            key={token.key}
            variant="caption"
            sx={{ display: 'block', fontFamily: 'monospace' }}
          >
            {token.label}: {token.address}
          </Typography>
        ))}
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="RPC URL"
          value={rpcUrl}
          onChange={(event) => setRpcUrl(event.target.value)}
          helperText="Use a CORS-enabled Base RPC endpoint."
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          multiline
          rows={6}
          label="Addresses"
          placeholder="One address per line. You can also paste any text; 0x addresses will be extracted."
          value={addressText}
          onChange={(event) => setAddressText(event.target.value)}
          helperText="Optional: prefill with REACT_APP_BATCH_QUERY_ADDRESSES."
        />
      </Box>

      <Box display="flex" gap={2} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<Search />}
          onClick={handleQuery}
          disabled={loading}
        >
          {loading ? 'Querying...' : 'Query Balances'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={handleClear}
          disabled={loading}
        >
          Clear Results
        </Button>
      </Box>

      {loading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress variant="determinate" value={progress} />
          <Typography variant="caption" color="textSecondary">
            {statusMessage || `Progress: ${Math.round(progress)}%`}
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {invalidLines.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Invalid lines detected ({invalidLines.length}). Only valid addresses were queried.
        </Alert>
      )}

      {results.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Results</Typography>
            <Box>
              <Chip label={`Addresses: ${results.length}`} size="small" sx={{ mr: 1 }} />
              <Chip label={`Tokens: ${headerTokens.length}`} size="small" />
            </Box>
          </Box>

          <TableContainer sx={{ maxHeight: 400, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Address</TableCell>
                  {headerTokens.map((token) => (
                    <TableCell key={token.key}>{token.symbol || token.label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((row, index) => (
                  <TableRow key={row.address} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell
                      sx={{ fontFamily: 'monospace', fontSize: '12px' }}
                      title={row.address}
                    >
                      {formatAddress(row.address, 6, 4)}
                    </TableCell>
                    {headerTokens.map((token) => (
                      <TableCell key={`${row.address}-${token.key}`}>
                        {row.balances?.[token.key] ?? '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Paper>
  );
};

export default BalanceBatchQuery;
