// Centralized environment configuration for API and WebSocket endpoints

// SINGLE SWITCH: change this to 'production' | 'testing' | 'development'
const CURRENT_ENV = 'testing';

// Host configuration per environment
const CONFIG = {
  production: {
    API_HOST: 'https://ghanish.in',
    WS_URL: 'wss://ghanish.in/ws/database-updates',
  },
  testing: {
    API_HOST: 'https://men4u.xyz',
    WS_URL: 'wss://men4u.xyz/ws/database-updates',
  },
  development: {
    API_HOST: 'https://men4u.xyz',
    WS_URL: 'wss://men4u.xyz/ws/database-updates',
  },
};

const { API_HOST, WS_URL } = CONFIG[CURRENT_ENV];

// Common base paths used across the app
const V2_COMMON_BASE = `${API_HOST}/v2/common`;
const COMMON_API_BASE = `${API_HOST}/common_api`;

export const ENV = {
  env: CURRENT_ENV,
  API_HOST,
  WS_URL,
  V2_COMMON_BASE,
  COMMON_API_BASE,
};

export default ENV;


