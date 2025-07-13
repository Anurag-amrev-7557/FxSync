import React, { useState, useEffect } from 'react';
import useSmoothAppearance from '../hooks/useSmoothAppearance';

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
  const [requestStatus, setRequestStatus] = useState(null);
  const [showRequestReceived, setShowRequestReceived] = useState(false);
  const [requestStartTime, setRequestStartTime] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [requestResult, setRequestResult] = useState(null); // 'approved' | 'denied' | null
  const [wasController, setWasController] = useState(false);
  const [showControllerOffer, setShowControllerOffer] = useState(false);
  const [showOfferSent, setShowOfferSent] = useState(false);
  const [showOfferAccepted, setShowOfferAccepted] = useState(false);
  const [showOfferDeclined, setShowOfferDeclined] = useState(false);
  
  const isController = controllerClientId && clientId && controllerClientId === clientId;
  const hasPendingRequest = pendingControllerRequests.some(req => req.clientId === clientId);
  
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
        setCurrentTime(Date.now());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [requestStatus, requestStartTime]);


  
  // Clear request status when becoming controller or when request is no longer pending
  useEffect(() => {
    // Detect when user becomes controller (request approved)
    if (isController && !wasController && requestStatus === 'sent') {
      setRequestStatus(null);
      setRequestStartTime(null);
      setRequestResult('approved');
      setTimeout(() => setRequestResult(null), 4000);
    }
    
    // Detect when request is denied (no longer pending but not controller)
    if (!isController && requestStatus === 'sent' && !hasPendingRequest && requestStartTime) {
      setRequestStatus(null);
      setRequestStartTime(null);
      setRequestResult('denied');
      setTimeout(() => setRequestResult(null), 4000);
    }
    
    // Update wasController state
    setWasController(isController);
  }, [isController, requestStatus, hasPendingRequest, requestStartTime, wasController]);
  
  const handleRequestController = () => {
    if (!socket || hasPendingRequest) return;
    
    setRequestStatus('pending');
    setRequestStartTime(Date.now());
    socket.emit('request_controller', { sessionId: socket.sessionId }, (res) => {
      if (res && res.success) {
        setRequestStatus('sent');
        // Don't auto-clear the status - let user cancel or wait for response
      } else {
        setRequestStatus('error');
        setRequestStartTime(null);
        setTimeout(() => setRequestStatus(null), 3000);
      }
    });
  };
  
  const handleCancelRequest = () => {
    if (!socket) return;
    
    socket.emit('cancel_controller_request', { sessionId: socket.sessionId }, (res) => {
      if (res && res.success) {
        setRequestStatus('cancelled');
        setRequestStartTime(null);
        setTimeout(() => setRequestStatus(null), 2000);
      }
    });
  };

  const handleAcceptControllerOffer = () => {
    if (!socket || !controllerOfferReceived) return;
    
    socket.emit('accept_controller_offer', { 
      sessionId: socket.sessionId, 
      offererClientId: controllerOfferReceived.offererClientId 
    }, (res) => {
      if (res && res.success) {
        setShowControllerOffer(false);
        // setControllerOfferReceived(null); // This line was removed as per the edit hint
      } else {
        console.warn('Failed to accept controller offer:', res);
      }
    });
  };

  const handleDeclineControllerOffer = () => {
    if (!socket || !controllerOfferReceived) return;
    
    socket.emit('decline_controller_offer', { 
      sessionId: socket.sessionId, 
      offererClientId: controllerOfferReceived.offererClientId 
    }, (res) => {
      if (res && res.success) {
        setShowControllerOffer(false);
        // setControllerOfferReceived(null); // This line was removed as per the edit hint
      } else {
        console.warn('Failed to decline controller offer:', res);
      }
    });
  };
  
  const handleApproveRequest = (requesterClientId) => {
    if (!socket) return;
    
    socket.emit('approve_controller_request', { 
      sessionId: socket.sessionId, 
      requesterClientId 
    }, (res) => {
      if (res && res.success) {
        // Success - the UI will update via controller_client_change event
      } else {
        console.warn('Failed to approve controller request:', res);
      }
    });
  };
  
  const handleDenyRequest = (requesterClientId) => {
    if (!socket) return;
    
    socket.emit('deny_controller_request', { 
      sessionId: socket.sessionId, 
      requesterClientId 
    }, (res) => {
      if (res && res.success) {
        // Success - the UI will update via controller_requests_update event
      } else {
        console.warn('Failed to deny controller request:', res);
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
  
  // Enhanced smooth appearance for notifications with staggered animations
  const requestReceivedVisible = useSmoothAppearance(showRequestReceived, 200, 'animate-slide-in-right');
  const requestStatusVisible = useSmoothAppearance(requestStatus, 200, 'animate-fade-in-scale');
  const requestResultVisible = useSmoothAppearance(requestResult, 300, 'animate-bounce-in');
  const controllerOfferVisible = useSmoothAppearance(showControllerOffer, 200, 'animate-bounce-in');
  const offerSentVisible = useSmoothAppearance(showOfferSent, 200, 'animate-slide-in-right');
  const offerAcceptedVisible = useSmoothAppearance(showOfferAccepted, 200, 'animate-bounce-in');
  const offerDeclinedVisible = useSmoothAppearance(showOfferDeclined, 200, 'animate-shake');
  
  return (
    <div className={`space-y-3 ${(isController && (showRequestReceived || pendingControllerRequests.length > 0)) || (!isController && (requestStatus || requestResult)) ? 'border-t border-neutral-800 pt-4' : ''}`}>
      {/* Request Result Notification */}
      {requestResult && (
        <div className={`rounded-lg p-3 ${requestResultVisible.animationClass} ${
          requestResult === 'approved' ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'
        } transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
              requestResult === 'approved' ? 'bg-green-500/20 animate-pulse' : 'bg-red-500/20 animate-pulse'
            }`}>
              {requestResult === 'approved' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400 animate-bounce">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22,4 12,14.01 9,11.01"></polyline>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 animate-bounce">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              )}
            </div>
            <div className="flex-1">
              <h4 className={`font-medium text-sm transition-all duration-300 ${
                requestResult === 'approved' ? 'text-green-400' : 'text-red-400'
              }`}>
                {requestResult === 'approved' ? 'Request Approved!' : 'Request Denied'}
              </h4>
              <p className={`text-xs transition-all duration-300 ${
                requestResult === 'approved' ? 'text-green-300' : 'text-red-300'
              }`}>
                {requestResult === 'approved' 
                  ? 'You are now the controller and can manage playback.' 
                  : 'Your request to become controller was denied.'
                }
              </p>
            </div>
            <button
              onClick={() => setRequestResult(null)}
              className={`hover:opacity-70 transition-all duration-200 hover:scale-110 ${
                requestResult === 'approved' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Controller Offer Notification */}
      {!isController && showControllerOffer && controllerOfferReceived && (
        <div className={`bg-purple-500/20 border border-purple-500/30 rounded-lg p-3 ${controllerOfferVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400 animate-bounce">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-purple-400 font-medium text-sm transition-all duration-300">Controller Offer</h4>
              <p className="text-purple-300 text-xs transition-all duration-300">
                {controllerOfferReceived.offererName} wants to make you the controller
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAcceptControllerOffer}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
                Accept
              </button>
              <button
                onClick={handleDeclineControllerOffer}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controller Offer Sent Notification */}
      {isController && showOfferSent && (
        <div className={`bg-green-500/20 border border-green-500/30 rounded-lg p-3 ${offerSentVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400 animate-bounce">
                <path d="M22 2L11 13"></path>
                <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-green-400 font-medium text-sm transition-all duration-300">Offer Sent</h4>
              <p className="text-green-300 text-xs transition-all duration-300">
                Controller offer sent to {controllerOfferSent?.targetName}
              </p>
            </div>
            <button
              onClick={() => setShowOfferSent(false)}
              className="text-green-400 hover:text-green-300 transition-all duration-200 hover:scale-110"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Controller Offer Accepted Notification */}
      {isController && showOfferAccepted && (
        <div className={`bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3 ${offerAcceptedVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 animate-bounce">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-emerald-400 font-medium text-sm transition-all duration-300">Offer Accepted!</h4>
              <p className="text-emerald-300 text-xs transition-all duration-300">
                {controllerOfferAccepted?.accepterName} accepted your controller offer
              </p>
            </div>
            <button
              onClick={() => setShowOfferAccepted(false)}
              className="text-emerald-400 hover:text-emerald-300 transition-all duration-200 hover:scale-110"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Controller Offer Declined Notification */}
      {isController && showOfferDeclined && (
        <div className={`bg-orange-500/20 border border-orange-500/30 rounded-lg p-3 ${offerDeclinedVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400 animate-shake">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-orange-400 font-medium text-sm transition-all duration-300">Offer Declined</h4>
              <p className="text-orange-300 text-xs transition-all duration-300">
                {controllerOfferDeclined?.declinerName} declined your controller offer
              </p>
            </div>
            <button
              onClick={() => setShowOfferDeclined(false)}
              className="text-orange-400 hover:text-orange-300 transition-all duration-200 hover:scale-110"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Controller Request Received Notification */}
      {isController && showRequestReceived && (
        <div className={`bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 ${requestReceivedVisible.animationClass} transform transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 animate-bounce">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-blue-400 font-medium text-sm transition-all duration-300">Controller Request</h4>
              <p className="text-blue-300 text-xs transition-all duration-300">
                {controllerRequestReceived?.requesterName} wants to become the controller
              </p>
            </div>
            <button
              onClick={() => setShowRequestReceived(false)}
              className="text-blue-400 hover:text-blue-300 transition-all duration-200 hover:scale-110"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {/* Request Status for Listeners */}
      {!isController && requestStatus && (
        <div className={`rounded-lg p-3 ${requestStatusVisible.animationClass} ${
          requestStatus === 'pending' ? 'bg-yellow-500/20 border border-yellow-500/30' :
          requestStatus === 'sent' ? 'bg-blue-500/20 border border-blue-500/30' :
          requestStatus === 'error' ? 'bg-red-500/20 border border-red-500/30' :
          'bg-neutral-500/20 border border-neutral-500/30'
        } transform transition-all duration-500 hover:scale-[1.01] hover:shadow-md`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
              requestStatus === 'pending' ? 'bg-yellow-500/20 animate-pulse' :
              requestStatus === 'sent' ? 'bg-blue-500/20 animate-pulse' :
              requestStatus === 'error' ? 'bg-red-500/20 animate-pulse' :
              'bg-neutral-500/20'
            }`}>
              {requestStatus === 'pending' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400 animate-spin">
                  <path d="M21 12a9 9 0 11-6.219-8.56"></path>
                </svg>
              ) : requestStatus === 'sent' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 animate-bounce">
                  <path d="M22 2L11 13"></path>
                  <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                </svg>
              ) : requestStatus === 'error' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 animate-shake">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                  <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
              )}
            </div>
            <div className="flex-1">
              <h4 className={`font-medium text-sm transition-all duration-300 ${
                requestStatus === 'pending' ? 'text-yellow-400' :
                requestStatus === 'sent' ? 'text-blue-400' :
                requestStatus === 'error' ? 'text-red-400' :
                'text-neutral-400'
              }`}>
                {requestStatus === 'pending' ? 'Sending request...' :
                 requestStatus === 'sent' ? 'Request sent to controller' :
                 requestStatus === 'error' ? 'Request failed' :
                 'Request cancelled'}
              </h4>
              {requestStatus === 'sent' && (
                <p className="text-blue-300 text-xs transition-all duration-300">
                  Waiting for controller to respond... 
                  {requestStartTime && (
                    <span className="ml-2 text-blue-400 font-mono animate-pulse">
                      ({Math.floor((currentTime - requestStartTime) / 1000)}s)
                    </span>
                  )}
                </p>
              )}
            </div>
            {requestStatus === 'sent' && (
              <button
                onClick={handleCancelRequest}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Pending Requests List for Controller */}
      {isController && pendingControllerRequests.length > 0 && (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 transform transition-all duration-500 hover:shadow-lg">
          <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary animate-pulse">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
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
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                    Approve
                  </button>
                  <button
                    onClick={() => handleDenyRequest(request.clientId)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-all duration-200 hover:scale-105 flex items-center gap-1 shadow-md hover:shadow-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
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
        <div className="flex items-center justify-between p-3 bg-neutral-900/30 border border-neutral-800/50 rounded-lg hover:bg-neutral-900/50 transition-all duration-300 group transform hover:scale-[1.02] hover:shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800/80 rounded-lg flex items-center justify-center group-hover:bg-neutral-700/80 transition-all duration-300 group-hover:scale-110">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover:text-neutral-300 transition-all duration-300 group-hover:scale-110">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div>
              <p className="text-neutral-300 text-sm font-medium transition-all duration-300 group-hover:text-white">Controller Access</p>
              <p className="text-neutral-500 text-xs transition-all duration-300 group-hover:text-neutral-400">Request permission to control playback</p>
            </div>
          </div>
          <button
            onClick={handleRequestController}
            className="px-3 py-1.5 bg-neutral-800/60 hover:bg-neutral-700/80 text-neutral-300 hover:text-white text-xs rounded-md transition-all duration-300 flex items-center gap-1.5 border border-neutral-700/50 hover:border-neutral-600/50 hover:scale-105 shadow-md hover:shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-300 group-hover:scale-110">
              <path d="M9 12l2 2 4-4"></path>
              <path d="M21 12c-1 0-2-1-2-2s1-2 2-2 2 1 2 2-1 2-2 2z"></path>
              <path d="M3 12c1 0 2-1 2-2s-1-2-2-2-2 1-2 2 1 2 2 2z"></path>
              <path d="M12 3c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2z"></path>
              <path d="M12 21c0-1 1-2 2-2s2 1 2 2-1 2-2 2-2-1-2-2z"></path>
            </svg>
            Request
          </button>
        </div>
      )}
    </div>
  );
} 