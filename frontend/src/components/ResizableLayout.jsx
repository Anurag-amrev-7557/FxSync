import React, { useState, useRef, useEffect } from 'react'

const ResizableLayout = ({ 
  leftPanel, 
  middlePanel, 
  rightPanel, 
  leftMinWidth = 200, 
  middleMinWidth = 200,
  rightMinWidth = 200,
  initialLeftWidth = null, // Will be calculated as equal width
  initialMiddleWidth = null // Will be calculated as equal width
}) => {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth)
  const [middleWidth, setMiddleWidth] = useState(initialMiddleWidth)
  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)
  const containerRef = useRef(null)
  const leftResizerRef = useRef(null)
  const rightResizerRef = useRef(null)

  // Calculate initial equal widths if not provided
  useEffect(() => {
    if ((initialLeftWidth === null || initialMiddleWidth === null) && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth
      const resizerWidth = 20 // Total width of both resizers
      const availableWidth = containerWidth - resizerWidth
      const equalWidth = availableWidth / 3
      
      if (initialLeftWidth === null) {
        setLeftWidth(Math.max(equalWidth, leftMinWidth))
      }
      if (initialMiddleWidth === null) {
        setMiddleWidth(Math.max(equalWidth, middleMinWidth))
      }
    }
  }, [initialLeftWidth, initialMiddleWidth, leftMinWidth, middleMinWidth])

  // Handle window resize to maintain equal widths if not manually adjusted
  useEffect(() => {
    const handleResize = () => {
      if (initialLeftWidth === null && initialMiddleWidth === null && containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth
        const resizerWidth = 20
        const availableWidth = containerWidth - resizerWidth
        const equalWidth = availableWidth / 3
        
        setLeftWidth(Math.max(equalWidth, leftMinWidth))
        setMiddleWidth(Math.max(equalWidth, middleMinWidth))
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [initialLeftWidth, initialMiddleWidth, leftMinWidth, middleMinWidth])

  const handleMouseDown = (e, resizerType) => {
    e.preventDefault()
    if (resizerType === 'left') {
      setIsDraggingLeft(true)
    } else {
      setIsDraggingRight(true)
    }
  }

  const handleMouseMove = (e) => {
    if (!isDraggingLeft && !isDraggingRight) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const containerWidth = containerRect.width
    const mouseX = e.clientX - containerRect.left

    if (isDraggingLeft) {
      const newLeftWidth = Math.max(leftMinWidth, Math.min(mouseX, containerWidth - middleMinWidth - rightMinWidth - 40))
      setLeftWidth(newLeftWidth)
    } else if (isDraggingRight) {
      const newMiddleWidth = Math.max(middleMinWidth, Math.min(mouseX - leftWidth - 20, containerWidth - leftWidth - rightMinWidth - 40))
      setMiddleWidth(newMiddleWidth)
    }
  }

  const handleMouseUp = () => {
    setIsDraggingLeft(false)
    setIsDraggingRight(false)
  }

  useEffect(() => {
    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDraggingLeft, isDraggingRight, leftWidth, middleWidth])

  return (
    <div 
      ref={containerRef}
      className={`flex h-full overflow-hidden relative resizable-layout ${isDraggingLeft || isDraggingRight ? 'dragging' : ''}`}
    >
      {/* Drag overlay */}
      {(isDraggingLeft || isDraggingRight) && (
        <div className="absolute inset-0 bg-black/10 pointer-events-none z-10" />
      )}
      {/* Left Panel */}
      <div 
        className="flex-shrink-0 overflow-hidden"
        style={{ width: `${leftWidth}px` }}
      >
        {leftPanel}
      </div>

      {/* Left Resizer */}
      <div
        ref={leftResizerRef}
        className={`w-1 cursor-col-resize transition-all duration-200 relative resizer ${
          isDraggingLeft ? 'dragging' : ''
        }`}
        onMouseDown={(e) => handleMouseDown(e, 'left')}
      >
        <div className="absolute inset-0 w-6 -left-2.5 cursor-col-resize"></div>
      </div>

      {/* Middle Panel */}
      <div 
        className="flex-shrink-0 overflow-hidden"
        style={{ width: middleWidth ? `${middleWidth}px` : '50%' }}
      >
        {middlePanel}
      </div>

      {/* Right Resizer */}
      <div
        ref={rightResizerRef}
        className={`w-1 cursor-col-resize transition-all duration-200 relative resizer ${
          isDraggingRight ? 'dragging' : ''
        }`}
        onMouseDown={(e) => handleMouseDown(e, 'right')}
      >
        <div className="absolute inset-0 w-6 -left-2.5 cursor-col-resize"></div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 overflow-hidden">
        {rightPanel}
      </div>
    </div>
  )
}

export default ResizableLayout 