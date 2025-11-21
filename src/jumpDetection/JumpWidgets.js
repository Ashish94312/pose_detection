/**
 * Jump Detection UI Widgets
 * Live widgets for displaying jump detection data
 */

import { useState, useEffect } from 'react';
import { jumpDetector } from './jumpDetector';
import './JumpWidgets.css';

/**
 * Main Jump Detection Widgets Component
 */
const JumpWidgets = () => {
  const [jumpState, setJumpState] = useState({
    isJumping: false,
    isInAir: false,
    isLanding: false,
    jumpCount: 0,
  });
  
  const [forceData, setForceData] = useState(null);
  const [lastJump, setLastJump] = useState(null);
  const [lastLanding, setLastLanding] = useState(null);
  const [currentAirtime, setCurrentAirtime] = useState(0);
  const [mass, setMass] = useState(jumpDetector.getMass());
  const [showMassInput, setShowMassInput] = useState(false);

  useEffect(() => {
    // Helper function to update state from jumpDetector
    const updateStateFromDetector = () => {
      const state = jumpDetector.getState();
      // Always create a new object to ensure React detects the change
      // Use functional update to get the latest state
      setJumpState(prevState => {
        const newState = {
          fsmState: state.fsmState,
          isJumping: state.isJumping,
          isInAir: state.isInAir,
          isLanding: state.isLanding,
          jumpCount: state.jumpCount,
        };
        // Always return new state object - React will handle comparison
        return newState;
      });
      setCurrentAirtime(state.currentAirtime || 0);
    };

    // Set up callbacks
    jumpDetector.onJumpDetected = (data) => {
      setLastJump(data);
      updateStateFromDetector();
    };

    jumpDetector.onLandingDetected = (data) => {
      console.log('[JumpWidgets] onLandingDetected callback fired', {
        jumpNumber: data.jumpNumber,
        isValid: data.isValid,
        jumpHeight: data.jumpHeight,
      });
      setLastLanding(data);
      // Immediately update state when landing is detected
      // The jumpCount has already been incremented in transitionToGrounded if valid
      // Force update by calling updateStateFromDetector
      updateStateFromDetector();
      // Also force an immediate update after a short delay to ensure React processes it
      setTimeout(() => {
        const currentState = jumpDetector.getState();
        console.log('[JumpWidgets] State after landing:', {
          jumpCount: currentState.jumpCount,
        });
        setJumpState(currentState);
      }, 10);
    };

    jumpDetector.onForceCalculated = (data) => {
      setForceData(data);
    };

    // Subscribe to pose data
    jumpDetector.subscribe();

    // Update state periodically to catch any missed updates
    // This ensures the UI stays in sync even if callbacks miss an update
    const interval = setInterval(() => {
      updateStateFromDetector();
    }, 100);

    return () => {
      clearInterval(interval);
      jumpDetector.unsubscribeFromFeed();
      jumpDetector.onJumpDetected = null;
      jumpDetector.onLandingDetected = null;
      jumpDetector.onForceCalculated = null;
    };
  }, []);

  const handleMassChange = (newMass) => {
    const massValue = parseFloat(newMass);
    if (!isNaN(massValue) && massValue > 0 && massValue <= 500) {
      setMass(massValue);
      jumpDetector.setMass(massValue);
    }
  };

  return (
    <div className="jump-widgets">
      <div className="jump-widgets-header">
        <h3>Jump Detection</h3>
        <button 
          className="mass-toggle-btn"
          onClick={() => setShowMassInput(!showMassInput)}
          title="Set mass for force calculation"
        >
          Mass: {mass} kg
        </button>
      </div>
      
      {showMassInput && (
        <div className="mass-input-container">
          <label>
            Mass (kg):
            <input
              type="number"
              min="1"
              max="500"
              step="0.1"
              value={mass}
              onChange={(e) => handleMassChange(e.target.value)}
              className="mass-input"
            />
          </label>
          <small>Used for force calculation (F = m × a)</small>
        </div>
      )}
      
      <div className="widget-grid">
        <StatusWidget state={jumpState} currentAirtime={currentAirtime} />
        <ForceWidget forceData={forceData} mass={mass} />
        <JumpStatsWidget lastJump={lastJump} lastLanding={lastLanding} />
      </div>
    </div>
  );
};

/**
 * Status Widget - Shows current jump state
 */
const StatusWidget = ({ state, currentAirtime }) => {
  const getStatusClass = () => {
    if (state.isLanding) return 'status-landing';
    if (state.isInAir) return 'status-in-air';
    if (state.isJumping) return 'status-jumping';
    return 'status-ready';
  };

  const getStatusText = () => {
    if (state.isLanding) return 'Landing';
    if (state.isInAir) return 'In Air';
    if (state.isJumping) return 'Takeoff';
    return 'Ready';
  };

  const formatAirtime = (ms) => {
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  return (
    <div className="widget status-widget">
      <div className="widget-title">Status</div>
      <div className={`status-indicator ${getStatusClass()}`}>
        {getStatusText()}
      </div>
      <div className="widget-value">Jumps: {state.jumpCount}</div>
      {(state.isInAir || state.isJumping) && currentAirtime > 0 && (
        <div className="widget-subtitle">
          <div>Airtime: {formatAirtime(currentAirtime)}</div>
        </div>
      )}
    </div>
  );
};

/**
 * Force Widget - Shows real-time force data
 */
const ForceWidget = ({ forceData, mass }) => {
  if (!forceData) {
    const weight = Math.round(mass * 9.81);
    return (
      <div className="widget force-widget">
        <div className="widget-title">Force</div>
        <div className="widget-value">— N</div>
        <div className="widget-subtitle">
          <div>Weight: {weight} N</div>
          <div>Mass: {mass} kg</div>
        </div>
      </div>
    );
  }

  const weight = Math.round(forceData.weight);
  const netForce = Math.round(forceData.netForce);
  const totalForce = Math.round(forceData.totalForce);
  // Velocity is now in m/s, convert to cm/s for display
  const velocity = (forceData.verticalVelocity * 100).toFixed(1);
  const acceleration = forceData.acceleration?.toFixed(2) || '0.00';
  
  // Determine which force to display prominently
  // If stationary (low acceleration and velocity), show weight
  // Otherwise show total force
  // Threshold: acceleration < 0.5 m/s² and velocity < 5 cm/s
  const isStationary = Math.abs(parseFloat(acceleration)) < 0.5 && Math.abs(parseFloat(velocity)) < 5;

  return (
    <div className="widget force-widget">
      <div className="widget-title">Force</div>
      {isStationary ? (
        <>
          <div className="widget-value">{weight} N</div>
          <div className="widget-subtitle">
            <div className="force-label">Weight (stationary)</div>
            <div>Net Force: {netForce} N</div>
            <div>Velocity: {velocity} cm/s</div>
            <div>Accel: {acceleration} m/s²</div>
          </div>
        </>
      ) : (
        <>
          <div className="widget-value">{totalForce} N</div>
          <div className="widget-subtitle">
            <div className="force-label">Total Force</div>
            <div>Weight: {weight} N</div>
            <div>Net: {netForce > 0 ? '+' : ''}{netForce} N</div>
            <div>Velocity: {velocity} cm/s</div>
            <div>Accel: {acceleration} m/s²</div>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Jump Stats Widget - Shows last jump and landing data
 */
const JumpStatsWidget = ({ lastJump, lastLanding }) => {
  const formatTime = (timestamp) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatAirtime = (ms) => {
    if (!ms && ms !== 0) return '—';
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  return (
    <div className="widget stats-widget">
      <div className="widget-title">Jump Metrics</div>
      <div className="widget-stats">
        <div className="stat-row highlight-stat">
          <span className="stat-label">Airtime:</span>
          <span className="stat-value">{lastLanding && lastLanding.airTime !== undefined ? formatAirtime(lastLanding.airTime) : '—'}</span>
        </div>
        <div className="stat-row highlight-stat">
          <span className="stat-label">Height:</span>
          <span className="stat-value">{lastLanding && lastLanding.jumpHeight !== undefined && lastLanding.jumpHeight !== null ? `${(lastLanding.jumpHeight * 100).toFixed(1)} cm` : '—'}</span>
        </div>
        <div className="stat-row highlight-stat">
          <span className="stat-label">Landing Time:</span>
          <span className="stat-value">{lastLanding && lastLanding.landingTime ? formatTime(lastLanding.landingTime) : (lastLanding && lastLanding.timestamp ? formatTime(lastLanding.timestamp) : '—')}</span>
        </div>
        {lastLanding && (
          <>
            <div className="stat-row">
              <span className="stat-label">Jump #:</span>
              <span className="stat-value">{lastLanding.jumpNumber}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Takeoff:</span>
              <span className="stat-value">{formatTime(lastLanding.takeoffTime || lastLanding.timestamp)}</span>
            </div>
          </>
        )}
        {!lastLanding && lastJump && (
          <>
            <div className="stat-row">
              <span className="stat-label">Jump #:</span>
              <span className="stat-value">Pending...</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Takeoff:</span>
              <span className="stat-value">{formatTime(lastJump.takeoffTime || lastJump.timestamp)}</span>
            </div>
          </>
        )}
        {lastLanding && lastLanding.groundReactionForce && (
          <div className="stat-row">
            <span className="stat-label">Ground Force:</span>
            <span className="stat-value">{Math.round(lastLanding.groundReactionForce)} N</span>
          </div>
        )}
        {!lastJump && !lastLanding && (
          <div className="stat-row">
            <span className="stat-label">Status:</span>
            <span className="stat-value">No jumps yet</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default JumpWidgets;

