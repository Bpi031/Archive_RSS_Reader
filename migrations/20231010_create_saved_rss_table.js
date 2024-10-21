exports.up = function(knex) {
    return knex.schema.createTable('saved_rss', function(table) {
      table.increments('id').primary();
      table.string('title');
      table.string('link');
      table.string('contentSnippet');
      table.string('pubDate');
      table.string('firstImage');
      table.string('archivedUrl');
      table.timestamps(true, true);
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.dropTable('saved_rss');
  };