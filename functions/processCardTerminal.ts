import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurantId, amount, terminalConfig, transactionRef } = await req.json();

        if (!restaurantId || !amount || !terminalConfig) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Get restaurant to verify manager access
        const restaurant = await base44.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurant?.[0]) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const terminal = terminalConfig;
        
        // Simulate terminal processing based on connection type
        const response = await processTerminalTransaction({
            amount,
            terminal,
            transactionRef: transactionRef || `TXN-${Date.now()}`,
            connectionType: terminal.connection_type || 'wifi'
        });

        return Response.json(response);
    } catch (error) {
        console.error('Card terminal error:', error);
        return Response.json({ 
            error: error.message || 'Terminal processing failed',
            success: false 
        }, { status: 500 });
    }
});

async function processTerminalTransaction({ amount, terminal, transactionRef, connectionType }) {
    // Check connection availability
    if (!navigator?.onLine && connectionType === 'wifi') {
        return {
            success: false,
            error: 'No network connection - please switch to Bluetooth or USB',
            status: 'failed'
        };
    }

    // Simulate terminal communication based on type
    const simulationDelay = Math.random() * 2000 + 1000; // 1-3 second processing
    
    return new Promise((resolve) => {
        setTimeout(() => {
            // Randomly succeed 95% of the time for testing
            const succeeded = Math.random() < 0.95;

            if (succeeded) {
                resolve({
                    success: true,
                    status: 'approved',
                    transactionRef,
                    amount,
                    terminal: terminal.reader_label || terminal.reader_id,
                    timestamp: new Date().toISOString(),
                    message: 'Transaction approved'
                });
            } else {
                resolve({
                    success: false,
                    status: 'declined',
                    transactionRef,
                    amount,
                    error: 'Card declined - please try another card',
                    timestamp: new Date().toISOString()
                });
            }
        }, simulationDelay);
    });
}