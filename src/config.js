// SINGLE SWITCH: change this to 'production' | 'testing' | 'development'
export const CURRENT_ENV = 'testing';

// Host configuration per environment
const CONFIG = {
  production: {
    API_HOST: 'https://menu4.xyz',
    WS_URL: 'wss://menu4.xyz/ws/database-updates',
  },
  testing: {
    API_HOST: 'https://menusmitra.xyz',
    WS_URL: 'wss://menusmitra.xyz/ws/database-updates',
  },
  development: {
    API_HOST: 'https://menu4.xyz',
    WS_URL: 'wss://menu4.xyz/ws/database-updates',
  },
};

const { API_HOST, WS_URL } = CONFIG[CURRENT_ENV] || CONFIG.development;

// Common base paths used across the app (v2.3)
export const V2_COMMON_BASE = `${API_HOST}/v2.3/common`;
export const V2_3_COMMON_BASE = V2_COMMON_BASE;
export const COMMON_API_BASE = `${API_HOST}/common_api`;

// PIN auth — verify_pin on same v2.3 base (override with REACT_APP_AUTH_API_URL for local server)
export const AUTH_API_BASE =
  process.env.REACT_APP_AUTH_API_URL || V2_COMMON_BASE;

/** app_type sent to POST /v2.3/common/verify_pin */
export const AUTH_APP_TYPE = "admin";

// Base API URL (alias for convenience)
export const API_URL = V2_COMMON_BASE;

// Firebase Config
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCoPZ3_Ktah8UBBSgh0_OXL5SQwUtL6Wok",
  authDomain: "menumitra-83831.firebaseapp.com",
  projectId: "menumitra-83831",
  storageBucket: "menumitra-83831.appspot.com",
  messagingSenderId: "851450497367",
  appId: "1:851450497367:web:e2347945f3decce56a9612",
  measurementId: "G-Q6V5R4EDYT"
};

// Firebase VAPID Key
export const VAPID_KEY = "BGsWfw7acs_yXMa_bcWfw-49_MQkV8MdSOrCih9OO-v9pQ7AvKA2niL1dvguaHMfObKP8tO7Bq_4aTVEwOyA8x4";

// Other configuration constants can be added here 

// add at the bottom (or export from wherever you prefer)
export const APP_INFO = {
  name: "MenuMitra",
  version: "2.2.0",
  releaseDate: "17 March 2026",
};

