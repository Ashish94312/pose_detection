/**
 * Performance Profiler UI Component
 * Displays real-time performance metrics for all profiled functions
 */

import { useState, useEffect, useRef } from 'react';
import { performanceProfiler } from '../utils/performanceProfiler';
import './PerformanceProfiler.css';

const PerformanceProfiler = () => {
  const [summary, setSummary] = useState(null);
  const [expandedFunctions, setExpandedFunctions] = useState(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(1000); // 1 second
  const intervalRef = useRef(null);

  useEffect(() => {
    const updateSummary = () => {
      const newSummary = performanceProfiler.getSummary();
      setSummary(newSummary);
    };

    // Initial update
    updateSummary();

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(updateSummary, refreshInterval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval]);

  const handleReset = () => {
    performanceProfiler.reset();
    setSummary(performanceProfiler.getSummary());
    setExpandedFunctions(new Set());
  };

  const handleExport = () => {
    performanceProfiler.downloadJSON();
  };

  const toggleFunction = (functionName) => {
    const newExpanded = new Set(expandedFunctions);
    if (newExpanded.has(functionName)) {
      newExpanded.delete(functionName);
    } else {
      newExpanded.add(functionName);
    }
    setExpandedFunctions(newExpanded);
  };

  const formatTime = (ms) => {
    if (ms < 0.001) return `${(ms * 1000).toFixed(2)} μs`;
    if (ms < 1) return `${(ms * 1000).toFixed(1)} μs`;
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  if (!summary || summary.functions.length === 0) {
    return (
      <div className="performance-profiler">
        <div className="profiler-header">
          <h3>Performance Profiler</h3>
          <div className="profiler-controls">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <button onClick={handleReset}>Reset</button>
          </div>
        </div>
        <div className="profiler-empty">
          No performance data yet. Start using the app to see metrics.
        </div>
      </div>
    );
  }

  return (
    <div className="performance-profiler">
      <div className="profiler-header">
        <h3>Performance Profiler</h3>
        <div className="profiler-controls">
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            disabled={!autoRefresh}
          >
            <option value={100}>100ms</option>
            <option value={500}>500ms</option>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
          <button onClick={handleReset}>Reset</button>
          <button onClick={handleExport}>Export JSON</button>
        </div>
      </div>

      <div className="profiler-summary">
        <div className="summary-stat">
          <span className="stat-label">Total Functions:</span>
          <span className="stat-value">{summary.totalFunctions}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Total Calls:</span>
          <span className="stat-value">{summary.totalCalls.toLocaleString()}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Total Time:</span>
          <span className="stat-value">{formatTime(summary.totalTime)}</span>
        </div>
      </div>

      <div className="profiler-functions">
        <div className="functions-header">
          <div className="header-col name-col">Function</div>
          <div className="header-col calls-col">Calls</div>
          <div className="header-col time-col">Avg Time</div>
          <div className="header-col time-col">Min Time</div>
          <div className="header-col time-col">Max Time</div>
          <div className="header-col time-col">Total Time</div>
          <div className="header-col percent-col">% of Total</div>
        </div>

        {summary.functions.map((func) => {
          const isExpanded = expandedFunctions.has(func.name);
          const recentSamples = performanceProfiler.getRecentSamples(func.name, 10);

          return (
            <div key={func.name} className="function-row">
              <div
                className="function-main"
                onClick={() => toggleFunction(func.name)}
              >
                <div className="function-col name-col">
                  <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                  <span className="function-name">{func.name}</span>
                </div>
                <div className="function-col calls-col">{func.calls.toLocaleString()}</div>
                <div className="function-col time-col">{formatTime(func.avgTime)}</div>
                <div className="function-col time-col">{formatTime(func.minTime)}</div>
                <div className="function-col time-col">{formatTime(func.maxTime)}</div>
                <div className="function-col time-col">{formatTime(func.totalTime)}</div>
                <div className="function-col percent-col">
                  <div className="percent-bar-container">
                    <div
                      className="percent-bar"
                      style={{ width: `${Math.min(func.percentage, 100)}%` }}
                    />
                    <span className="percent-text">{formatPercentage(func.percentage)}</span>
                  </div>
                </div>
              </div>

              {isExpanded && recentSamples.length > 0 && (
                <div className="function-details">
                  <div className="details-header">Recent Samples (last 10):</div>
                  <div className="samples-list">
                    {recentSamples.map((sample, idx) => (
                      <div key={idx} className="sample-item">
                        <span className="sample-time">{formatTime(sample.duration)}</span>
                        {sample.metadata && Object.keys(sample.metadata).length > 0 && (
                          <span className="sample-metadata">
                            {Object.entries(sample.metadata)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PerformanceProfiler;

