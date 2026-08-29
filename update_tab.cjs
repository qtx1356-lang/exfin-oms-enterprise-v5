const fs = require('fs');

let content = fs.readFileSync('src/features/admin/DailyAdminReportTab.tsx', 'utf8');

// Insert safeFetchJson helper
content = content.replace('  // Load configuration & history', `  // Helper to safely fetch and parse JSON
  const safeFetchJson = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options);
    const contentType = res.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(\`Expected JSON but received \${contentType || 'unknown format'} (HTTP \${res.status})\`);
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || \`Request failed with HTTP \${res.status}\`);
    }
    return data;
  };

  // Load configuration & history`);

// Update fetch config
content = content.replace(/const configRes = await fetch\([\s\S]*?\/\/ Fetch history/g, `const configData = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/config', { headers });
      if (configData.success) {
        setConfig(configData.config);
      } else {
        throw new Error(configData.error || 'Failed to fetch config');
      }

      // Fetch history`);

// Update fetch history
content = content.replace(/const historyRes = await fetch\([\s\S]*?\} catch \(err: any\) \{/g, `const historyData = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/history', { headers });
      if (historyData.success) {
        setHistory(historyData.history || []);
      }
    } catch (err: any) {`);

// Update POST config
content = content.replace(/const res = await fetch\(API_BASE_URL \+ '\/api\/admin\/daily-report\/config', \{[\s\S]*?\} else \{\n\s*throw new Error\(data.error[\s\S]*?\}\n\s*\} catch \(err: any\) \{/g, `const data = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/config', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': \`Bearer \${token}\`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      if (data.success) {
        setConfig(data.config);
        setStatusMsg({ type: 'success', text: 'Daily Admin Report configuration saved successfully.' });
        loadData(); // Reload to refresh logs
      } else {
        throw new Error(data.error || \`Failed to save config\`);
      }
    } catch (err: any) {`);

// Update POST test
content = content.replace(/const res = await fetch\(API_BASE_URL \+ '\/api\/admin\/daily-report\/send-test', \{[\s\S]*?\} else \{\n\s*throw new Error\(data.error[\s\S]*?\}\n\s*\} catch \(err: any\) \{/g, `const data = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/send-test', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': \`Bearer \${token}\`,
          'Content-Type': 'application/json',
        },
      });
      if (data.success) {
        setStatusMsg({ type: 'success', text: data.message || 'Test report email dispatched successfully.' });
      } else {
        throw new Error(data.error || \`Test email delivery failed\`);
      }
    } catch (err: any) {`);

// Update POST manual
content = content.replace(/const res = await fetch\(API_BASE_URL \+ '\/api\/admin\/daily-report\/send-yesterday', \{[\s\S]*?\} else \{\n\s*throw new Error\(data.error[\s\S]*?\}\n\s*\} catch \(err: any\) \{/g, `const data = await safeFetchJson(API_BASE_URL + '/api/admin/daily-report/send-yesterday', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': \`Bearer \${token}\`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: manualDate || undefined }),
      });
      if (data.success) {
        setStatusMsg({ 
          type: 'success', 
          text: \`Daily operations report generated and sent to admin for \${data.reportDate} (MessageId: \${data.messageId || 'simulated'}).\` 
        });
        loadData(); // reload log history
      } else {
        throw new Error(data.error || \`Manual report generation failed\`);
      }
    } catch (err: any) {`);

fs.writeFileSync('src/features/admin/DailyAdminReportTab.tsx', content);
