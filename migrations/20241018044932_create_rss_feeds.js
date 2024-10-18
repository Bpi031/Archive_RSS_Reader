//function to add and delete rss feeds
exports.up = function(knex) {
    return knex.schema.createTable('rss_feeds', function(table) {
      table.increments('id').primary();
      table.string('url').notNullable();
      table.timestamps(true, true);
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.dropTable('rss_feeds');
  };