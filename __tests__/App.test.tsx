/**
 * @format
 */

import 'react-native';
import React from 'react';

jest.mock('../src/App', () => {
  const React = require('react');
  const {Text} = require('react-native');
  return {
    __esModule: true,
    App: () => React.createElement(Text, null, 'AppRoot'),
  };
});

jest.mock('../src/components/ErrorBoundary', () => {
  const React = require('react');
  return {
    __esModule: true,
    ErrorBoundary: ({children}: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('../src/components/Toast', () => {
  const React = require('react');
  const {jest: jestGlobals} = require('@jest/globals');
  return {
    __esModule: true,
    ToastProvider: ({children}: any) => React.createElement(React.Fragment, null, children),
    ToastBridge: () => null,
    useToast: () => ({show: jestGlobals.fn(), dismiss: jestGlobals.fn()}),
    showToast: jestGlobals.fn(),
  };
});

jest.mock('../src/navigation/AppNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    AppNavigator: () => React.createElement(Text, null, 'AppNavigator'),
  };
});

import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it, jest} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});
