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
    // Set up callbacks
    jumpDetector.onJumpDetected = (data) => {
      setLastJump(data);
      setJumpState(jumpDetector.getState());
    };

    jumpDetector.onLandingDetected = (data) => {
      setLastLanding(data);
      setJumpState(jumpDetector.getState());
    };

    jumpDetector.onForceCalculated = (data) => {
      setForceData(data);
    };

    // Subscribe to pose data
    jumpDetector.subscribe();

    // Update state periodically
    const interval = setInterval(() => {
      const state = jumpDetector.getState();
      setJumpState(state);
      setCurrentAirtime(state.currentAirtime || 0);
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
  const getStatusColor = () => {
    if (state.isLanding) return '#ff6b6b';
    if (state.isInAir) return '#4ecdc4';
    if (state.isJumping) return '#95e1d3';
    return '#ddd';
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
      <div className="status-indicator" style={{ backgroundColor: getStatusColor() }}>
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
      {lastJump && (
        <div className="widget-stats">
          <div className="stat-row">
            <span className="stat-label">Jump #:</span>
            <span className="stat-value">{lastJump.jumpNumber}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Takeoff:</span>
            <span className="stat-value">{formatTime(lastJump.takeoffTime || lastJump.timestamp)}</span>
          </div>
        </div>
      )}
      {lastLanding && (
        <div className="widget-stats">
          <div className="stat-row">
            <span className="stat-label">Airtime:</span>
            <span className="stat-value">{formatAirtime(lastLanding.airTime)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Height:</span>
            <span className="stat-value">{(lastLanding.jumpHeight * 100).toFixed(1)} cm</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Landing:</span>
            <span className="stat-value">{formatTime(lastLanding.landingTime || lastLanding.timestamp)}</span>
          </div>
          {lastLanding.groundReactionForce && (
            <div className="stat-row">
              <span className="stat-label">Ground Force:</span>
              <span className="stat-value">{Math.round(lastLanding.groundReactionForce)} N</span>
            </div>
          )}
        </div>
      )}
      {!lastJump && !lastLanding && (
        <div className="widget-value">No jumps yet</div>
      )}
    </div>
  );
};

export default JumpWidgets;

