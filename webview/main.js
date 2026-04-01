// Chart instances
let tokenGauge = null;
let mcpGauge = null;
let trendChart = null;

// Initialize charts when DOM is ready
function initCharts() {
    initTokenGauge();
    initMcpGauge();
    initTrendChart();
}

function initTokenGauge() {
    const ctx = document.getElementById('token-gauge').getContext('2d');
    tokenGauge = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#10b981', 'transparent'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '75%',
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function initMcpGauge() {
    const ctx = document.getElementById('mcp-gauge').getContext('2d');
    mcpGauge = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#10b981', 'transparent'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '75%',
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function initTrendChart() {
    const ctx = document.getElementById('trend-chart').getContext('2d');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Token Usage',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: true, grid: { display: false } },
                y: { display: true, beginAtZero: true }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// Update gauges with new data
function updateGauges(tokenPercent, mcpPercent) {
    const tokenLabel = document.getElementById('token-percentage');
    const mcpLabel = document.getElementById('mcp-percentage');

    tokenLabel.textContent = tokenPercent;
    mcpLabel.textContent = mcpPercent;

    // Set color based on threshold
    const tokenColor = getColorForPercentage(tokenPercent);
    const mcpColor = getColorForPercentage(mcpPercent);

    tokenLabel.setAttribute('data-level', getLevel(tokenPercent));
    mcpLabel.setAttribute('data-level', getLevel(mcpPercent));

    tokenGauge.data.datasets[0].data = [tokenPercent, 100 - tokenPercent];
    tokenGauge.data.datasets[0].backgroundColor = [tokenColor, 'transparent'];
    tokenGauge.update('none');

    mcpGauge.data.datasets[0].data = [mcpPercent, 100 - mcpPercent];
    mcpGauge.data.datasets[0].backgroundColor = [mcpColor, 'transparent'];
    mcpGauge.update('none');
}

// Update trend chart with usage data
function updateTrendChart(usageData) {
    const labels = usageData.map(d => {
        const date = new Date(d.timestamp);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });
    const values = usageData.map(d => d.tokens || 0);

    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = values;
    trendChart.update('none');
}

// Update breakdown table
function updateBreakdownTable(modelUsage) {
    const tbody = document.querySelector('#breakdown-table tbody');
    tbody.innerHTML = '';

    if (!modelUsage || modelUsage.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">No data available</td></tr>';
        return;
    }

    modelUsage.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.model || 'Unknown'}</td>
            <td>${item.requests || 0}</td>
            <td>${formatTokens(item.tokens || 0)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Helper functions
function getColorForPercentage(percentage) {
    if (percentage > 80) return '#ef4444';
    if (percentage > 50) return '#f59e0b';
    return '#10b981';
}

function getLevel(percentage) {
    if (percentage > 80) return 'low';
    if (percentage > 50) return 'medium';
    return 'high';
}

function formatTokens(tokens) {
    if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
    if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
    return tokens.toString();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initCharts);
