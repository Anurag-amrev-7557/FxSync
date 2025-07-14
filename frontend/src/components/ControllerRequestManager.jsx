import React, { useState, useEffect, useReducer, useRef } from 'react';
import useSmoothAppearance from '../hooks/useSmoothAppearance';
import { useToast } from './ToastProvider';
import {
  ApprovedIcon,
  DeniedIcon,
  OfferIcon,
  OfferSentIcon,
  CheckIcon,
  CloseIcon,
  SpinnerIcon,
  RequestIcon,
  CancelIcon
} from './ControllerIcons';

export default function ControllerRequestManager({
  socket,
  controllerClientId,
  clientId,
  pendingControllerRequests,
  controllerRequestReceived,
  controllerOfferReceived,
  controllerOfferSent,
  controllerOfferAccepted,
  controllerOfferDeclined
}) {
  const [wasController, setWasController] = useState(false);
  const [showRequestReceived, setShowRequestReceived] = useState(false);
  const [showControllerOffer, setShowControllerOffer] = useState(false);
  const [showOfferSent, setShowOfferSent] = useState(false);
  const [showOfferAccepted, setShowOfferAccepted] = useState(false);
  const [showOfferDeclined, setShowOfferDeclined] = useState(false);
  
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  const hasPendingRequest = pendingControllerRequests.some(req => req.clientId === clientId);
  
  const { showToast } = useToast();

  const initialRequestState = {
    status: null, // 'pending' | 'sent' | 'error' | 'cancelled' | null
    startTime: null,
    result: null, // 'approved' | 'denied' | null
  };

  function requestReducer(state, action) {
    switch (action.type) {
      case 'PENDING':
        return { status: 'pending', startTime: action.time, result: null };
      case 'SENT':
        return { ...state, status: 'sent' };
      case 'ERROR':
        return { status: 'error', startTime: null, result: null };
      case 'CANCELLED':
        return { status: 'cancelled', startTime: null, result: null };
      case 'APPROVED':
        return { status: null, startTime: null, result: 'approved' };
      case 'DENIED':
        return { status: null, startTime: null, result: 'denied' };
      case 'CLEAR_RESULT':
        return { ...state, result: null };
      case 'CLEAR_STATUS':
        return { ...state, status: null, startTime: null };
      default:
        return state;
    }
  }

  const [requestState, dispatchRequest] = useReducer(requestReducer, initialRequestState);
  const { status: requestStatus, startTime: requestStartTime, result: requestResult } = requestState;

  // Show request received notification for controller
  useEffect(() => {
    if (controllerRequestReceived && isController) {
      setShowRequestReceived(true);
      setTimeout(() => setShowRequestReceived(false), 5000);
    }
  }, [controllerRequestReceived, isController]);

  // Show controller offer notification for listeners
  useEffect(() => {
    if (controllerOfferReceived && !isController) {
      setShowControllerOffer(true);
    }
  }, [controllerOfferReceived, isController]);

  // Show offer sent notification for controller
  useEffect(() => {
    if (controllerOfferSent && isController) {
      setShowOfferSent(true);
      setTimeout(() => setShowOfferSent(false), 4000);
    }
  }, [controllerOfferSent, isController]);

  // Show offer accepted notification for controller
  useEffect(() => {
    if (controllerOfferAccepted && isController) {
      setShowOfferAccepted(true);
      setTimeout(() => setShowOfferAccepted(false), 4000);
    }
  }, [controllerOfferAccepted, isController]);

  // Show offer declined notification for controller
  useEffect(() => {
    if (controllerOfferDeclined && isController) {
      setShowOfferDeclined(true);
      setTimeout(() => setShowOfferDeclined(false), 4000);
    }
  }, [controllerOfferDeclined, isController]);
  
  // Initialize wasController state
  useEffect(() => {
    setWasController(isController);
  }, [isController]);

  // Update current time for timer display
  useEffect(() => {
    if (requestStatus === 'sent' && requestStartTime) {
      const interval = setInterval(() => {
        // setCurrentTime(Date.now()); // This line was removed as per the edit hint
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [requestStatus, requestStartTime]);


  
  // Clear request status when becoming controller or when request is no longer pending
  useEffect(() => {
    // Detect when user becomes controller (request approved)
    if (isController && !wasController && requestStatus === 'sent') {
      dispatchRequest({ type: 'APPROVED' });
      setTimeout(() => dispatchRequest({ type: 'CLEAR_RESULT' }), 4000);
    }
    
    // Detect when request is denied (no longer pending but not controller)
    if (!isController && requestStatus === 'sent' && !hasPendingRequest && requestStartTime) {
      dispatchRequest({ type: 'DENIED' });
      setTimeout(() => dispatchRequest({ type: 'CLEAR_RESULT' }), 4000);
    }
    
    // Update wasController state
    setWasController(isController);
  }, [isController, requestStatus, hasPendingRequest, requestStartTime, wasController]);
  
  const handleRequestController = () => {
    if (!socket || !socket.connected) {
      showToast('Cannot request controller: not connected to server', { type: 'error' });
      return;
    }
    if (!socket.sessionId) {
      showToast('Cannot request controller: session not initialized', { type: 'error' });
      return;
    }
    if (hasPendingRequest) return;
    
    dispatchRequest({ type: 'PENDING', time: Date.now() });
    socket.emit('request_controller', { sessionId: socket.sessionId }, (res) => {
      if (res && res.success) {
        dispatchRequest({ type: 'SENT' });
        // Don't auto-clear the status - let user cancel or wait for response
      } else {
        dispatchRequest({ type: 'ERROR' });
        dispatchRequest({ type: 'CLEAR_STATUS' });
        showToast('Failed to request controller role', { type: 'error' });
        setTimeout(() => dispatchRequest({ type: 'CLEAR_STATUS' }), 3000);
      }
    });
  };
  
  const handleCancelRequest = () => {
    if (!socket || !socket.connected) {
      showToast('Cannot cancel request: not connected to server', { type: 'error' });
      return;
    }
    if (!socket.sessionId) {
      showToast('Cannot cancel request: session not initialized', { type: 'error' });
      return;
    }
    
    socket.emit('cancel_controller_request', { sessionId: socket.sessionId }, (res) => {
      if (res && res.success) {
        dispatchRequest({ type: 'CANCELLED' });
        dispatchRequest({ type: 'CLEAR_STATUS' });
        setTimeout(() => dispatchRequest({ type: 'CLEAR_STATUS' }), 2000);
      }
    });
  };

  const handleAcceptControllerOffer = () => {
    if (!socket || !socket.connected) {
      showToast('Cannot accept offer: not connected to server', { type: 'error' });
      return;
    }
    if (!socket.sessionId) {
      showToast('Cannot accept offer: session not initialized', { type: 'error' });
      return;
    }
    if (!controllerOfferReceived) return;
    
    socket.emit('accept_controller_offer', { 
      sessionId: socket.sessionId, 
      offererClientId: controllerOfferReceived.offererClientId 
    }, (res) => {
      if (res && res.success) {
        setShowControllerOffer(false);
        // setControllerOfferReceived(null); // This line was removed as per the edit hint
      } else {
        console.warn('Failed to accept controller offer:', res);
        showToast('Failed to accept controller offer', { type: 'error' });
      }
    });
  };

  const handleDeclineControllerOffer = () => {
    if (!socket || !socket.connected) {
      showToast('Cannot decline offer: not connected to server', { type: 'error' });
      return;
    }
    if (!socket.sessionId) {
      showToast('Cannot decline offer: session not initialized', { type: 'error' });
      return;
    }
    if (!controllerOfferReceived) return;
    
    socket.emit('decline_controller_offer', { 
      sessionId: socket.sessionId, 
      offererClientId: controllerOfferReceived.offererClientId 
    }, (res) => {
      if (res && res.success) {
        setShowControllerOffer(false);
        // setControllerOfferReceived(null); // This line was removed as per the edit hint
      } else {
        console.warn('Failed to decline controller offer:', res);
        showToast('Failed to decline controller offer', { type: 'error' });
      }
    });
  };
  
  const handleApproveRequest = (requesterClientId) => {
    if (!socket || !socket.connected) {
      showToast('Cannot approve request: not connected to server', { type: 'error' });
      return;
    }
    if (!socket.sessionId) {
      showToast('Cannot approve request: session not initialized', { type: 'error' });
      return;
    }
    socket.emit('approve_controller_request', { 
      sessionId: socket.sessionId, 
      requesterClientId 
    }, (res) => {
      if (res && res.success) {
        // Success - the UI will update via controller_client_change event
      } else {
        console.warn('Failed to approve controller request:', res);
        showToast('Failed to approve controller request', { type: 'error' });
      }
    });
  };
  
  const handleDenyRequest = (requesterClientId) => {
    if (!socket || !socket.connected) {
      showToast('Cannot deny request: not connected to server', { type: 'error' });
      return;
    }
    if (!socket.sessionId) {
      showToast('Cannot deny request: session not initialized', { type: 'error' });
      return;
    }
    socket.emit('deny_controller_request', { 
      sessionId: socket.sessionId, 
      requesterClientId 
    }, (res) => {
      if (res && res.success) {
        // Success - the UI will update via controller_requests_update event
      } else {
        console.warn('Failed to deny controller request:', res);
        showToast('Failed to deny controller request', { type: 'error' });
      }
    });
  };
  
  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s ago`;
    }
    return `${seconds}s ago`;
  };
  
  // Enhanced smooth appearance for notifications with improved, fast, and smooth animations
  const requestReceivedVisible = useSmoothAppearance(showRequestReceived, { spring: true, enterDuration: 180, exitDuration: 120 });
  const requestStatusVisible = useSmoothAppearance(requestStatus, { spring: true, enterDuration: 180, exitDuration: 120 });
  const requestResultVisible = useSmoothAppearance(requestResult, { spring: true, enterDuration: 180, exitDuration: 120 });
  const controllerOfferVisible = useSmoothAppearance(showControllerOffer, { spring: true, enterDuration: 180, exitDuration: 120 });
  const offerSentVisible = useSmoothAppearance(showOfferSent, { spring: true, enterDuration: 180, exitDuration: 120 });
  const offerAcceptedVisible = useSmoothAppearance(showOfferAccepted, { spring: true, enterDuration: 180, exitDuration: 120 });
  const offerDeclinedVisible = useSmoothAppearance(showOfferDeclined, { spring: true, enterDuration: 180, exitDuration: 120 });

  // Keyboard shortcuts for controller offer (Enter = accept, Escape = decline)
  useEffect(() => {
    if (!showControllerOffer) return;
    function onKeyDown(e) {
      if (e.key === 'Enter') {
        handleAcceptControllerOffer();
      } else if (e.key === 'Escape') {
        handleDeclineControllerOffer();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showControllerOffer]);

  // Add refs for focus management
  const controllerOfferRef = useRef(null);
  const controllerRequestRef = useRef(null);

  // Clear transient states when a new request is initiated or a new offer/request is received
  useEffect(() => {
    // When a new controller offer or request is received, clear requestResult and requestStatus
    if (showControllerOffer || showRequestReceived) {
      dispatchRequest({ type: 'CLEAR_RESULT' });
      dispatchRequest({ type: 'CLEAR_STATUS' });
    }
  }, [showControllerOffer, showRequestReceived]);

  // Focus management for critical notifications
  useEffect(() => {
    if (showControllerOffer && controllerOfferRef.current) {
      controllerOfferRef.current.focus();
    }
  }, [showControllerOffer]);

  useEffect(() => {
    if (showRequestReceived && controllerRequestRef.current) {
      controllerRequestRef.current.focus();
    }
  }, [showRequestReceived]);

  // Prevent overlapping notifications: hide others when a new one appears
  useEffect(() => {
    if (showControllerOffer) {
      setShowRequestReceived(false);
      setShowOfferSent(false);
      setShowOfferAccepted(false);
      setShowOfferDeclined(false);
    } else if (showRequestReceived) {
      setShowControllerOffer(false);
      setShowOfferSent(false);
      setShowOfferAccepted(false);
      setShowOfferDeclined(false);
    }
  }, [showControllerOffer, showRequestReceived]);

  // When the controller role changes, clear all notification and request state
  useEffect(() => {
    setShowRequestReceived(false);
    setShowControllerOffer(false);
    setShowOfferSent(false);
    setShowOfferAccepted(false);
    setShowOfferDeclined(false);
    dispatchRequest({ type: 'CLEAR_RESULT' });
    dispatchRequest({ type: 'CLEAR_STATUS' });
  }, [isController]);

  return (
    <div className={`space-y-3 ${(isController && (showRequestReceived || pendingControllerRequests.length > 0)) || (!isController && (requestStatus || requestResult)) ? 'border-t border-neutral-800 pt-4' : ''}`}>
      {/* Request Result Notification */}
      {requestResult && (
        <div role="alert" aria-live="assertive" className={`rounded-lg p-3 ${requestResultVisible.animationClass} bg-neutral-900/80 border border-neutral-700/60 transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}> 
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 bg-neutral-800 animate-pulse">
              {requestResult === 'approved' ? (
                <ApprovedIcon className="text-white animate-bounce" />
              ) : (
                <DeniedIcon className="text-white animate-bounce" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-sm text-white transition-all duration-300">
                {requestResult === 'approved' ? 'Request Approved!' : 'Request Denied'}
              </h4>
              <p className="text-xs text-neutral-300 transition-all duration-300">
                {requestResult === 'approved' 
                  ? 'You are now the controller and can manage playback.' 
                  : 'Your request to become controller was denied.'
                }
              </p>
            </div>
            <button
              onClick={() => dispatchRequest({ type: 'CLEAR_RESULT' })}
              className="hover:opacity-70 transition-all duration-200 hover:scale-110 text-white"
            >
              <CloseIcon className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Controller Offer Notification */}
      {!isController && showControllerOffer && controllerOfferReceived && (
        <div role="alert" aria-live="assertive" tabIndex={-1} ref={controllerOfferRef} className={`bg-neutral-900/80 border border-neutral-700/60 rounded-lg p-3 ${controllerOfferVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center animate-pulse">
              <OfferIcon className="text-white animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-medium text-sm transition-all duration-300">Controller Offer</h4>
              <p className="text-neutral-300 text-xs transition-all duration-300">
                {controllerOfferReceived.offererName} wants to make you the controller
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAcceptControllerOffer}
                className="px-3 py-1.5 bg-white hover:bg-neutral-200 text-black text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg"
              >
                <CheckIcon className="text-black" />
                Accept
              </button>
              <button
                onClick={handleDeclineControllerOffer}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg border border-neutral-700"
              >
                <CloseIcon className="text-white" />
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controller Offer Sent Notification */}
      {isController && showOfferSent && (
        <div role="alert" aria-live="assertive" className={`bg-neutral-900/80 border border-neutral-700/60 rounded-lg p-3 ${offerSentVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center animate-pulse">
              <OfferSentIcon className="text-white animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-medium text-sm transition-all duration-300">Offer Sent</h4>
              <p className="text-neutral-300 text-xs transition-all duration-300">
                Controller offer sent to {controllerOfferSent?.targetName}
              </p>
            </div>
            <button
              onClick={() => setShowOfferSent(false)}
              className="text-white hover:text-neutral-300 transition-all duration-200 hover:scale-110"
            >
              <CloseIcon className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Controller Offer Accepted Notification */}
      {isController && showOfferAccepted && (
        <div role="alert" aria-live="assertive" className={`bg-neutral-900/80 border border-neutral-700/60 rounded-lg p-3 ${offerAcceptedVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center animate-pulse">
              <CheckIcon className="text-white animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-medium text-sm transition-all duration-300">Offer Accepted!</h4>
              <p className="text-neutral-300 text-xs transition-all duration-300">
                {controllerOfferAccepted?.accepterName} accepted your controller offer
              </p>
            </div>
            <button
              onClick={() => setShowOfferAccepted(false)}
              className="text-white hover:text-neutral-300 transition-all duration-200 hover:scale-110"
            >
              <CloseIcon className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Controller Offer Declined Notification */}
      {isController && showOfferDeclined && (
        <div role="alert" aria-live="assertive" className={`bg-neutral-900/80 border border-neutral-700/60 rounded-lg p-3 ${offerDeclinedVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center animate-pulse">
              <DeniedIcon className="text-white animate-shake" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-medium text-sm transition-all duration-300">Offer Declined</h4>
              <p className="text-neutral-300 text-xs transition-all duration-300">
                {controllerOfferDeclined?.declinerName} declined your controller offer
              </p>
            </div>
            <button
              onClick={() => setShowOfferDeclined(false)}
              className="text-white hover:text-neutral-300 transition-all duration-200 hover:scale-110"
            >
              <CloseIcon className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Controller Request Received Notification */}
      {isController && showRequestReceived && (
        <div role="alert" aria-live="assertive" tabIndex={-1} ref={controllerRequestRef} className={`bg-neutral-900/80 border border-neutral-700/60 rounded-lg p-3 ${requestReceivedVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center animate-pulse">
              <RequestIcon className="text-white animate-bounce" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-medium text-sm transition-all duration-300">Controller Request</h4>
              <p className="text-neutral-300 text-xs transition-all duration-300">
                {controllerRequestReceived?.requesterName} wants to become the controller
              </p>
            </div>
            <button
              onClick={() => setShowRequestReceived(false)}
              className="text-white hover:text-neutral-300 transition-all duration-200 hover:scale-110"
            >
              <CloseIcon className="text-white" />
            </button>
          </div>
        </div>
      )}
      
      {/* Request Status for Listeners */}
      {!isController && requestStatus && (
        <div role="alert" aria-live="assertive" className={`rounded-lg p-3 ${requestStatusVisible.animationClass} bg-neutral-900/80 border border-neutral-700/60 transform transition-all duration-500 hover:scale-[1.01] hover:shadow-md`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 bg-neutral-800 animate-pulse">
              {requestStatus === 'pending' ? (
                <SpinnerIcon className="text-white animate-spin" />
              ) : requestStatus === 'sent' ? (
                <OfferSentIcon className="text-white animate-bounce" />
              ) : requestStatus === 'error' ? (
                <DeniedIcon className="text-white animate-shake" />
              ) : (
                <CancelIcon className="text-white" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-sm text-white transition-all duration-300">
                {requestStatus === 'pending' ? 'Sending request...' :
                 requestStatus === 'sent' ? 'Request sent to controller' :
                 requestStatus === 'error' ? 'Request failed' :
                 'Request cancelled'}
              </h4>
              {requestStatus === 'sent' && (
                <p className="text-neutral-300 text-xs transition-all duration-300">
                  Waiting for controller to respond... 
                  {requestStartTime && (
                    <span className="ml-2 text-white font-mono animate-pulse">
                      ({Math.floor((Date.now() - requestStartTime) / 1000)}s)
                    </span>
                  )}
                </p>
              )}
            </div>
            {requestStatus === 'sent' && (
              <button
                onClick={handleCancelRequest}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg border border-neutral-700"
              >
                <CancelIcon className="text-white" />
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Pending Requests List for Controller */}
      {isController && pendingControllerRequests.length > 0 && (
        <div role="alert" aria-live="assertive" className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 transform transition-all duration-500 hover:shadow-lg">
          <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
            <RequestIcon className="text-white animate-pulse" />
            Controller Requests ({pendingControllerRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingControllerRequests.map((request, index) => (
              <div 
                key={request.clientId} 
                className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg transform transition-all duration-300 hover:scale-[1.02] hover:bg-neutral-800/70 hover:shadow-md"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm transition-all duration-300">
                      {request.requesterName}
                    </span>
                    <span className="text-neutral-400 text-xs animate-pulse">
                      {formatTimeAgo(request.requestTime)}
                    </span>
                  </div>
                  <p className="text-neutral-400 text-xs transition-all duration-300">
                    Wants to become the controller
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveRequest(request.clientId)}
                    className="px-3 py-1.5 bg-white hover:bg-neutral-200 text-black text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg"
                  >
                    <CheckIcon className="text-black" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleDenyRequest(request.clientId)}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg border border-neutral-700"
                  >
                    <DeniedIcon className="text-white" />
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Request Controller Button for Listeners */}
      {!isController && !hasPendingRequest && !requestStatus && (
        <div role="alert" aria-live="assertive" className="flex items-center justify-between p-3 bg-neutral-900/30 border border-neutral-800/50 rounded-lg hover:bg-neutral-900/50 transition-all duration-300 group transform hover:scale-[1.02] hover:shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800/80 rounded-lg flex items-center justify-center group-hover:bg-neutral-700/80 transition-all duration-300 group-hover:scale-110">
              <OfferIcon className="text-white group-hover:text-neutral-300 transition-all duration-300 group-hover:scale-110" />
            </div>
            <div>
              <p className="text-white text-sm font-medium transition-all duration-300 group-hover:text-white">Controller Access</p>
              <p className="text-neutral-500 text-xs transition-all duration-300 group-hover:text-neutral-400">Request permission to control playback</p>
            </div>
          </div>
          <button
            onClick={handleRequestController}
            className="px-3 py-1.5 bg-neutral-800/60 hover:bg-neutral-700/80 text-white hover:text-neutral-200 text-xs rounded-md transition-all duration-300 flex items-center gap-1.5 border border-neutral-700/50 hover:border-neutral-600/50 hover:scale-105 shadow-md hover:shadow-lg"
          >
            <CheckIcon className="transition-all duration-300 group-hover:scale-110" />
            Request
          </button>
        </div>
      )}
    </div>
  );
} 