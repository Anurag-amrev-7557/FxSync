import React from 'react';
import { render, screen, act } from '@testing-library/react';
import SessionPage from './SessionPage';

jest.useFakeTimers();

describe('SessionPage sync edge cases', () => {
  it('should request a fresh sync state after join/resume', () => {
    const mockSocket = { emit: jest.fn() };
    render(
      <SessionPage
        currentSessionId="test-session"
        setCurrentSessionId={() => {}}
        displayName="TestUser"
        setDisplayName={() => {}}
        onLeaveSession={() => {}}
        socket={mockSocket}
        connected={true}
        controllerId={null}
        controllerClientId={null}
        clients={[]}
        clientId="client-1"
        getServerTime={() => Date.now()}
        pendingControllerRequests={[]}
        sessionSyncState={null}
        rtt={10}
        timeOffset={0}
        jitter={0}
        drift={0}
        forceNtpBatchSync={() => {}}
      />
    );
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'sync_request',
      { sessionId: 'test-session' },
      expect.any(Function)
    );
  });

  // TODO: Add tests for rapid state changes, controller handoff, and high drift scenarios
}); 