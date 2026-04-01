// Listen for messages from extension
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
        case 'loading':
            showLoading();
            break;
        case 'updateData':
            updateData(message.data);
            break;
        case 'error':
            showError(message.error);
            break;
    }
});

// Show loading state
function showLoading() {
    document.querySelector('.container').classList.add('loading');
}

// Update all UI with new data
function updateData(data) {
    document.querySelector('.container').classList.remove('loading');

    // Update gauges
    const tokenSummary = extractTokenSummary(data.quotaLimits);
    const mcpSummary = extractMcpSummary(data.quotaLimits);
    updateGauges(tokenSummary.percentage, mcpSummary.percentage);

    // Update trend chart
    updateTrendChart(data.modelUsage || []);

    // Update breakdown table
    updateBreakdownTable(data.modelUsage || []);

    // Update timestamp
    updateTimestamp(data.timestamp);
}

// Show error message
function showError(errorMessage) {
    document.querySelector('.container').classList.remove('loading');

    let errorDiv = document.querySelector('.error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        document.querySelector('.container').prepend(errorDiv);
    }

    errorDiv.innerHTML = `
        <p>${errorMessage}</p>
        <button onclick="retryFetch()">Retry</button>
    `;
}

// Extract token summary from quota limits
function extractTokenSummary(limits) {
    const tokenLimit = limits.limits?.find(l => l.type === 'TOKENS_LIMIT');
    return {
        percentage: tokenLimit?.percentage || 0,
        used: parseInt(tokenLimit?.currentValue || '0'),
        total: parseInt(tokenLimit?.usage || '100')
    };
}

// Extract MCP summary from quota limits
function extractMcpSummary(limits) {
    const mcpLimit = limits.limits?.find(l => l.type === 'TIME_LIMIT');
    return {
        percentage: mcpLimit?.percentage || 0,
        used: parseInt(mcpLimit?.currentValue || '0'),
        total: parseInt(mcpLimit?.usage || '100')
    };
}

// Update timestamp
function updateTimestamp(timestamp) {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString();
    const header = document.querySelector('.header');
    let timeSpan = header.querySelector('.timestamp');
    if (!timeSpan) {
        timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        timeSpan.style.cssText = 'font-size: 11px; color: var(--color-gray);';
        header.appendChild(timeSpan);
    }
    timeSpan.textContent = `Updated: ${timeStr}`;
}

// Retry fetch
function retryFetch() {
    const errorDiv = document.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.remove();
    }
    vscode.postMessage({ command: 'refresh' });
}

// Refresh button click handler
document.getElementById('refresh-btn').addEventListener('click', () => {
    vscode.postMessage({ command: 'refresh' });
});
