// Jest test setup - runs after the test framework is set up
const { TextEncoder, TextDecoder } = require('util');

// Polyfill TextEncoder/TextDecoder globally before loading JSDOM
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { JSDOM } = require('jsdom');

// Set up DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLSelectElement = dom.window.HTMLSelectElement;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock Electron APIs
global.electronAPI = {
  scanForWatchoutServers: jest.fn(),
  addManualServer: jest.fn(),
  removeManualServer: jest.fn(),
  updateManualServer: jest.fn(),
  clearOfflineServers: jest.fn(),
  getAppVersion: jest.fn(),
  minimizeWindow: jest.fn(),
  maximizeWindow: jest.fn(),
  closeWindow: jest.fn(),
  onStartupWarning: jest.fn(),
  dismissStartupWarning: jest.fn()
};

// Mock alert and confirm
global.alert = jest.fn();
global.confirm = jest.fn();

// Set up fetch mock
global.fetch = jest.fn();

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
});
