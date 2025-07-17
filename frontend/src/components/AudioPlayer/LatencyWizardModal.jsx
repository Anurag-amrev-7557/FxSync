import React from 'react';
import PropTypes from 'prop-types';

/**
 * LatencyWizardModal - Latency calibration wizard modal for AudioPlayer
 * @param {Object} props
 * @param {boolean} props.show
 * @param {number} props.step
 * @param {number} props.testResult
 * @param {function} props.onNext
 * @param {function} props.onCancel
 * @param {function} props.onPlayTestSound
 * @param {number} props.testStart
 */
export default function LatencyWizardModal({ show, step, testResult, onNext, onCancel, onPlayTestSound }) {
  if (!show) return null;
  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.7)',zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#18181b',padding:32,borderRadius:16,maxWidth:340,width:'90vw',boxShadow:'0 4px 32px #000',color:'#fff',textAlign:'center'}}>
        {step === 1 && (
          <>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Audio Latency Calibration</h2>
            <p style={{marginBottom:18}}>When you click <b>Play Test Sound</b>, you will hear a beep. As soon as you hear it, click <b>I Heard It!</b> as quickly as possible.</p>
            <button onClick={onNext} className="px-4 py-2 bg-blue-600 rounded text-white font-semibold hover:bg-blue-700 transition">Play Test Sound</button>
            <button onClick={onCancel} className="ml-3 px-3 py-2 bg-neutral-700 rounded text-white hover:bg-neutral-600 transition">Cancel</button>
          </>
        )}
        {step === 2 && (
          <>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Click When You Hear the Beep</h2>
            <p style={{marginBottom:18}}>Click <b>I Heard It!</b> as soon as you hear the beep sound.</p>
            <button onClick={onNext} className="px-4 py-2 bg-green-600 rounded text-white font-semibold hover:bg-green-700 transition">I Heard It!</button>
          </>
        )}
        {step === 3 && (
          <>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Calibration Complete</h2>
            <p style={{marginBottom:18}}>Measured latency: <b>{testResult ? (testResult*1000).toFixed(0) : '--'} ms</b></p>
            <button onClick={onNext} className="px-4 py-2 bg-blue-600 rounded text-white font-semibold hover:bg-blue-700 transition">Done</button>
          </>
        )}
      </div>
    </div>
  );
}

LatencyWizardModal.propTypes = {
  show: PropTypes.bool.isRequired,
  step: PropTypes.number.isRequired,
  testResult: PropTypes.number,
  onNext: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onPlayTestSound: PropTypes.func,
  testStart: PropTypes.number
}; 