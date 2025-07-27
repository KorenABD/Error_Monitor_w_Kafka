exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('error_categories').del();
  
  // Inserts seed entries
  await knex('error_categories').insert([
    { name: 'database', description: 'Database related errors', color: '#fed7d7' },
    { name: 'api', description: 'API and external service errors', color: '#feebc8' },
    { name: 'security', description: 'Authentication and security errors', color: '#fbb6ce' },
    { name: 'filesystem', description: 'File and storage errors', color: '#c6f6d5' },
    { name: 'performance', description: 'Performance and memory issues', color: '#bee3f8' },
    { name: 'network', description: 'Network connectivity errors', color: '#e9d8fd' },
    { name: 'system', description: 'System resource errors', color: '#fed7e2' },
    { name: 'external', description: 'Third-party service errors', color: '#fefcbf' },
    { name: 'cache', description: 'Caching system errors', color: '#c6f6d5' },
    { name: 'infrastructure', description: 'Infrastructure and deployment errors', color: '#fed7d7' },
    { name: 'backup', description: 'Backup and recovery errors', color: '#e6fffa' }
  ]);
};