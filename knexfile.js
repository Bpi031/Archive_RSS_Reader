module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './rss_feeds.db'
    },
    useNullAsDefault: true
  }
};