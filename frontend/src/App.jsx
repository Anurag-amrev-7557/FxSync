import React, { useState, useEffect } from 'react'
import SessionForm from './components/SessionForm'
import AudioPlayer from './components/AudioPlayer'
import DeviceList from './components/DeviceList'
import ChatBox from './components/ChatBox'
import Playlist from './components/Playlist'
import useSocket from './hooks/useSocket'
import './App.css'

function App() {
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [queue, setQueue] = useState([])

  const { socket, connected, controllerId, controllerClientId, clients, clientId } = useSocket(currentSessionId)

  useEffect(() => {
    if (!socket) return
    const handleChat = (msg) => setMessages((prev) => [...prev, msg])
    socket.on('chat_message', handleChat)
    socket.on('reaction', handleChat)
    return () => {
      socket.off('chat_message', handleChat)
      socket.off('reaction', handleChat)
    }
  }, [socket])

  useEffect(() => {
    if (!socket) return
    const handleQueue = (q) => setQueue(q)
    socket.on('queue_update', handleQueue)
    return () => {
      socket.off('queue_update', handleQueue)
    }
  }, [socket])

  const handleJoin = (sessionId) => {
    setCurrentSessionId(sessionId)
    setMessages([])
    setQueue([])
  }

  const isController = controllerClientId && clientId && controllerClientId === clientId

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionForm onJoin={handleJoin} currentSessionId={currentSessionId} />
      {currentSessionId && (
        <>
          <AudioPlayer
            disabled={!currentSessionId}
            socket={socket}
            isSocketConnected={connected}
            controllerId={controllerId}
            controllerClientId={controllerClientId}
            clientId={clientId}
            clients={clients}
          />
          <DeviceList
            clients={clients}
            controllerClientId={controllerClientId}
            clientId={clientId}
            socket={socket}
          />
          <Playlist
            queue={queue}
            isController={isController}
            socket={socket}
            sessionId={currentSessionId}
          />
          <ChatBox
            socket={socket}
            sessionId={currentSessionId}
            clientId={clientId}
            messages={messages}
            onSend={(msg) => setMessages((prev) => [...prev, msg])}
            clients={clients}
          />
        </>
      )}
      {/* Later: AudioPlayer, SyncStatus, DeviceList go here */}
    </div>
  )
}

export default App
