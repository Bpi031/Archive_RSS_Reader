//function to hide and unhide rss feeds
exports.up = function(knex) {
    return knex.schema.table('rss_feeds', function(table) {
      table.boolean('is_hidden').defaultTo(false);
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('rss_feeds', function(table) {
      table.dropColumn('is_hidden');
    });
  };