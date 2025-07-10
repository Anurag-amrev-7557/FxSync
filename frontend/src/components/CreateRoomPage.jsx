import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CreateRoom from './CreateRoom'
import LoadingSpinner from './LoadingSpinner'

// CreateRoomPage handles fetching the sessionId and showing CreateRoom full page
function CreateRoomPage({ onConfirm }) {
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const fetchSessionId = async () => {
      setLoading(true)
      setError('')
      try {
        const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
        const res = await fetch(`${url}/session/generate-session-id`)
        const data = await res.json()
        setSessionId(data.sessionId || '')
      } catch (e) {
        setError('Failed to create new room')
      } finally {
        setLoading(false)
      }
    }
    fetchSessionId()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-white">
        <LoadingSpinner size="lg" text="Creating room..." />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-white">
        <div className="p-6 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-lg">{error}</div>
        <button onClick={() => navigate('/')} className="ml-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full">Back</button>
      </div>
    )
  }
  return (
    <CreateRoom
      sessionId={sessionId}
      onConfirm={() => navigate(`/session/${sessionId}`)}
      onCancel={() => navigate('/')}
    />
  )
}

export default CreateRoomPage 