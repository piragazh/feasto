import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { restaurant_id, days = 7 } = await req.json();
        
        // Get failed/timeout commands from the last N days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const failedLogs = await base44.asServiceRole.entities.ScreenCommandLog.filter({
            restaurant_id,
            status: ['failed', 'timeout']
        }, '-created_date', 100);
        
        // Filter by date
        const recentFailures = failedLogs.filter(log => 
            new Date(log.created_date) > cutoffDate
        );
        
        // Analyze patterns
        const commandFailures = {};
        const screenFailures = {};
        const errorPatterns = {};
        
        for (const log of recentFailures) {
            // Count failures by command type
            commandFailures[log.command] = (commandFailures[log.command] || 0) + 1;
            
            // Count failures by screen
            screenFailures[log.screen_name] = (screenFailures[log.screen_name] || 0) + 1;
            
            // Analyze error messages for patterns
            if (log.error_message) {
                const errorKey = log.error_message.substring(0, 50); // First 50 chars
                errorPatterns[errorKey] = errorPatterns[errorKey] || {
                    count: 0,
                    fullMessage: log.error_message,
                    command: log.command
                };
                errorPatterns[errorKey].count++;
            }
        }
        
        // Generate suggestions based on patterns
        const suggestions = [];
        
        // Check for screen-specific issues
        for (const [screenName, count] of Object.entries(screenFailures)) {
            if (count > 3) {
                suggestions.push({
                    type: 'screen_issue',
                    severity: 'high',
                    screen: screenName,
                    message: `Screen "${screenName}" has failed ${count} commands. Check network connectivity or restart the screen.`
                });
            }
        }
        
        // Check for command-specific issues
        for (const [command, count] of Object.entries(commandFailures)) {
            if (count > 5) {
                suggestions.push({
                    type: 'command_issue',
                    severity: 'medium',
                    command,
                    message: `Command "${command}" has failed ${count} times. This command may not be supported or has a bug.`
                });
            }
        }
        
        // Analyze timeout patterns
        const timeouts = recentFailures.filter(log => log.status === 'timeout');
        if (timeouts.length > 5) {
            suggestions.push({
                type: 'timeout_issue',
                severity: 'high',
                message: `${timeouts.length} commands timed out. Check if screens are checking for commands regularly (heartbeat interval).`
            });
        }
        
        // Common error patterns
        for (const [errorKey, data] of Object.entries(errorPatterns)) {
            if (data.count > 2) {
                let solution = 'Check the error details and screen logs.';
                
                if (data.fullMessage.toLowerCase().includes('network')) {
                    solution = 'Network connectivity issue detected. Check internet connection on affected screens.';
                } else if (data.fullMessage.toLowerCase().includes('permission')) {
                    solution = 'Permission denied. Screen may need elevated browser permissions.';
                } else if (data.fullMessage.toLowerCase().includes('cache')) {
                    solution = 'Cache-related issue. Try clearing browser cache on affected screens.';
                }
                
                suggestions.push({
                    type: 'error_pattern',
                    severity: 'medium',
                    count: data.count,
                    error: errorKey,
                    message: `Error pattern detected ${data.count} times: "${errorKey}..."`,
                    solution
                });
            }
        }
        
        return Response.json({
            success: true,
            analysis: {
                total_failures: recentFailures.length,
                by_command: commandFailures,
                by_screen: screenFailures,
                error_patterns: Object.values(errorPatterns),
                suggestions
            }
        });
    } catch (error) {
        console.error('Command analysis error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});