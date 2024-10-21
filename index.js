const express = require('express');
const RSSParser = require('rss-parser');
const axios = require('axios');
const path = require('path');
const knex = require('knex')(require('./knexfile').development);

const app = express();
const parser = new RSSParser();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const archiveServices = [
  'https://archive.today/submit/?url=',
  'https://archive.fo/submit/?url=',
  'https://archive.is/submit/?url=',
  'https://archive.li/submit/?url=',
  'https://archive.md/submit/?url=',
  'https://archive.ph/submit/?url=',
  'https://archive.vn/submit/?url='
];

function getFaviconUrl(url) {
  const domain = new URL(url).hostname;
  return `https://${domain}/favicon.ico`;
}

function getFirstImage(content) {
  const imgTagMatch = content.match(/<img[^>]+src="([^">]+)"/);
  return imgTagMatch ? imgTagMatch[1] : null;
}

function getImageFromEnclosure(enclosure) {
  if (enclosure && enclosure.url) {
    return enclosure.url;
  }
  return null;
}

function getImageFromMediaContent(mediaContent) {
  if (mediaContent && mediaContent['media:content'] && mediaContent['media:content']['@_url']) {
    return mediaContent['media:content']['@_url'];
  }
  if (mediaContent && mediaContent['media:thumbnail'] && mediaContent['media:thumbnail']['@_url']) {
    return mediaContent['media:thumbnail']['@_url'];
  }
  return null;
}

async function getArchivedUrl(url) {
  const maxRetries = 2;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (const service of archiveServices) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await axios.get(service + encodeURIComponent(url));
        return response.request.res.responseUrl;
      } catch (error) {
        if (error.response && error.response.status === 429) {
          attempt++;
          const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.error(`Error with ${service}: ${error.message}. Retrying in ${backoffTime / 1000} seconds...`);
          await delay(backoffTime);
        } else {
          console.error(`Error with ${service}:`, error.message);
          break;
        }
      }
    }
  }
  throw new Error('All archive services failed');
}

app.post('/archive', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    console.error('No URL provided in request body');
    return res.status(400).send('URL parameter is required');
  }
  try {
    const archivedUrl = await getArchivedUrl(url);
    res.json({ archivedUrl });
  } catch (error) {
    console.error('Error archiving URL:', error.message);
    res.status(500).json({ archivedUrl: null });
  }
});

app.post('/rss', async (req, res) => {
  const feedUrl = req.body.url;

  if (!feedUrl) {
    return res.status(400).send('URL parameter is required');
  }

  try {
    await knex('rss_feeds').insert({ url: feedUrl });
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error saving the RSS feed URL');
  }
});

app.post('/delete-rss', async (req, res) => {
  const feedId = req.body.id;

  try {
    await knex('rss_feeds').where({ id: feedId }).del();
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error deleting the RSS feed URL');
  }
});

app.post('/hide-rss', async (req, res) => {
  const feedId = req.body.id;

  try {
    const feed = await knex('rss_feeds').where({ id: feedId }).first();
    await knex('rss_feeds').where({ id: feedId }).update({ is_hidden: !feed.is_hidden });
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error hiding the RSS feed URL');
  }
});


app.get('/', async (req, res) => {
  const feeds = await knex('rss_feeds').select('*');
  let feedRows = feeds.map(feed => `
    <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
      <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
        ${feed.url}
      </th>
      <td class="px-6 py-4">
        <form action="/delete-rss" method="post" class="inline">
          <input type="hidden" name="id" value="${feed.id}">
          <button type="submit" class="rounded-md border border-slate-300 py-2 px-4 text-center text-sm transition-all shadow-sm text-white hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none" type="button">Delete</button>
        </form>
        <form action="/hide-rss" method="post" class="inline">
          <input type="hidden" name="id" value="${feed.id}">
          <button type="submit" class="rounded-md border border-slate-300 py-2 px-4 text-center text-sm transition-all shadow-sm text-white hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none" type="button">${feed.is_hidden ? 'Show' : 'Hide'}</button>
        </form>
      </td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RSS Feed Reader</title>
      <link href="/styles.css" rel="stylesheet">
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
      <script>
        function toggleTable() {
          const table = document.getElementById('rssTable');
          table.style.display = table.style.display === 'none' ? 'block' : 'none';
        }
      </script>
    </head>
    <body class="bg-neutral-950 p-6">
      <div class="max-w-3xl mx-auto bg-neutral-950 p-6 rounded-lg shadow-md">
        <h1 class="text-2xl font-bold mb-4 text-white">RSS Feed Reader</h1>
        <button onclick="toggleTable()" class="rounded-md border border-slate-300 py-2 px-4 text-center text-sm transition-all shadow-sm text-white hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none" type="button">Manage RSS Feeds</button>
        <div id="rssTable" style="display: none;" class="mt-4">
          <form action="/rss" method="post" class="mb-4">
            <label for="url" class="block text-sm font-medium text-white">Enter RSS Feed URL:</label>
            <input type="text" id="url" name="url" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
            <button type="submit" class="mt-2 rounded-md border border-slate-300 py-2 px-4 text-center text-sm transition-all shadow-sm text-white hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none" type="button">Save RSS</button>
          </form>
          <div class="relative overflow-x-auto shadow-md sm:rounded-lg">
            <table class="w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400">
              <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                <tr>
                  <th scope="col" class="px-6 py-3 text-whit">RSS Feed URL</th>
                  <th scope="col" class="px-6 py-3 text-white">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${feedRows}
              </tbody>
            </table>
          </div>
        </div>
        <h2 class="text-xl font-bold mb-4 mt-4 text-white">Saved RSS Feeds</h2>
        <ul>
          ${feeds.map(feed => `<li><a href="/rss/${feed.id}" class=" text-white text-indigo-600 hover:underline">${feed.url}</a></li>`).join('')}
        </ul>
        <a href="/all-rss" class="mt-4 inline-block rounded-md border border-slate-300 py-2 px-4 text-center text-sm transition-all shadow-sm text-white hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none" type="button">View All RSS Contents</a>
      </div>
    </body>
    </html>
  `);
});

app.get('/all-rss', async (req, res) => {
  try {
    const feeds = await knex('rss_feeds').select('*');
    let allItems = [];

    for (const feedRecord of feeds) {
      const feed = await parser.parseURL(feedRecord.url);
      allItems = allItems.concat(feed.items);
    }

    // Sort all items by publication date
    allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    let htmlContent = '';

    for (const item of allItems) {
      const firstImage = getFirstImage(item.content || item['content:encoded'] || '') ||
                         getImageFromEnclosure(item.enclosure) ||
                         getImageFromMediaContent(item);
      htmlContent += `
        <div class="p-4 bg-zinc-900 rounded-lg shadow-md flex flex-col items-start">
          <div class="flex-shrink-0">
            <img src="${getFaviconUrl(item.link)}" class="rounded-lg mr-2" alt="Favicon" class="w-4 h-4 mr-2">
          </div>
          <div class="flex-grow bg-zinc-900">
            <a href="#" onclick="archiveUrl('${item.link}')" class="text-lg text-white font-semibold text-indigo-600 hover:underline">${item.title}</a>
            <p class="mt-2 text-white">${item.contentSnippet}</p>
            <p class="mt-1 text-sm text-slate-400">${item.pubDate}</p>
          </div>
          ${firstImage ? `<div class="flex-shrink-0 mt-4"><img src="${firstImage}" alt="Image" class="w-full h-48 object-cover"></div>` : ''}
        </div>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>All RSS Feeds</title>
        <link href="/styles.css" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          async function archiveUrl(url) {
            try {
              const response = await fetch('/archive', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
              });
              const data = await response.json();
              if (data.archivedUrl) {
                window.open(data.archivedUrl, '_blank');
              } else {
                alert('All archive services failed');
              }
            } catch (error) {
              console.error('Error archiving URL:', error.message);
              alert('All archive services failed');
            }
          }
        </script>
      </head>
      <body class="bg-neutral-950 p-6">
        <div class="flex">
          <div class="w-1/6 bg-neutral-950 p-4 rounded-lg shadow-md">
            <h2 class="text-2xl font-bold mb-4 text-white">RSS Feeds</h2>
            <ul class="space-y-2">
              ${feeds.map(feed => `
                <a href="/rss/${feed.id}" class="block">
                  <div class="flex items-center h-1">
                    <img src="${getFaviconUrl(feed.url)}" alt="Favicon" class="w-4 h-4 mr-2">
                  </div>
                </a>
                <br></br>
              `).join('')}
            </ul>
          </div>
          <div class="border-s-2 border-white"></div> <!-- White line -->
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full bg-neutral-950 p-6 rounded-lg shadow-md ml-4">
            ${htmlContent}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching or parsing the RSS feeds');
  }
});

app.get('/rss/:id', async (req, res) => {
  const feedId = req.params.id;

  try {
    const feeds = await knex('rss_feeds').select('*');
    const feedRecord = await knex('rss_feeds').where({ id: feedId }).first();
    if (!feedRecord) {
      return res.status(404).send('RSS feed not found');
    }

    const feed = await parser.parseURL(feedRecord.url);
    let htmlContent = '';

    // Sort items by publication date
    feed.items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    for (const item of feed.items) {
      const firstImage = getFirstImage(item.content || item['content:encoded'] || '') ||
                         getImageFromEnclosure(item.enclosure) ||
                         getImageFromMediaContent(item);
      htmlContent += `
        <div class="p-4 bg-zinc-900 rounded-lg shadow-md flex flex-col items-start">
          <div class="flex-shrink-0">
            <img src="${getFaviconUrl(item.link)}" class="rounded-lg mr-2" alt="Favicon" class="w-4 h-4 mr-2">
          </div>
          <div class="flex-grow bg-zinc-900">
            <a href="#" onclick="archiveUrl('${item.link}')" class="text-lg text-white font-semibold text-indigo-600 hover:underline">${item.title}</a>
            <p class="mt-2 text-white">${item.contentSnippet}</p>
            <p class="mt-1 text-sm text-slate-400">${item.pubDate}</p>
          </div>
          ${firstImage ? `<div class="flex-shrink-0 mt-4"><img src="${firstImage}" alt="Image" class="w-full h-48 object-cover"></div>` : ''}
        </div>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${feed.title}</title>
        <link href="/styles.css" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        <script>
          async function archiveUrl(url) {
            try {
              const response = await fetch('/archive', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
              });
              const data = await response.json();
              if (data.archivedUrl) {
                window.open(data.archivedUrl, '_blank');
              } else {
                alert('All archive services failed');
              }
            } catch (error) {
              console.error('Error archiving URL:', error.message);
              alert('All archive services failed');
            }
          }
        </script>
      </head>
      <body class="bg-neutral-950 p-6">
        <div class="flex">
          <div class="w-1/6 bg-neutral-950 p-4 rounded-lg shadow-md">
            <h2 class="text-2xl font-bold mb-4 text-white">RSS Feeds</h2>
            <ul class="space-y-2">
              <a href="/all-rss" class="block">
                <div class="flex items-center h-1">
                  <i class="fas fa-rss w-4 h-4 mr-2 text-orange-500"></i>
                  <span class="text-indigo-600 text-white hover:underline">All RSS</span>
                </div>
              </a>
              <br></br>
              ${feeds.map(feed => `
                <a href="/rss/${feed.id}" class="block">
                  <div class="flex items-center h-1">
                    <img src="${getFaviconUrl(feed.url)}" alt="Favicon" class="w-4 h-4 mr-2">
                  </div>
                </a>
                <br></br>
              `).join('')}
            </ul>
          </div>
          <div class="border-s-2 border-white"></div> <!-- White line -->
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full bg-neutral-950 p-6 rounded-lg shadow-md ml-4">
            ${htmlContent}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching or parsing the RSS feed');
  }
});

app.get('/saved-rss', async (req, res) => {
  try {
    const savedItems = await knex('saved_rss').select('*');
    const feeds = await knex('rss_feeds').select('*');

    let htmlContent = '';

    if (savedItems.length === 0) {
      htmlContent = '<p class="text-white">No saved RSS content available.</p>';
    } else {
      for (const item of savedItems) {
        htmlContent += `
          <div class="p-4 bg-zinc-900 rounded-lg shadow-md flex flex-col items-start">
            <div class="flex-shrink-0">
              <img src="${getFaviconUrl(item.link)}" class="rounded-lg mr-2" alt="Favicon" class="w-4 h-4 mr-2">
            </div>
            <div class="flex-grow bg-zinc-900">
              <a href="${item.archivedUrl}" class="text-lg text-white font-semibold text-indigo-600 hover:underline">${item.title}</a>
              <p class="mt-2 text-white">${item.contentSnippet}</p>
              <p class="mt-1 text-sm text-slate-400">${item.pubDate}</p>
            </div>
            ${item.firstImage ? `<div class="flex-shrink-0 mt-4"><img src="${item.firstImage}" alt="Image" class="w-full h-48 object-cover rounded-lg"></div>` : ''}
          </div>`;
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Saved RSS Feeds</title>
        <link href="/styles.css" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
      </head>
      <body class="bg-neutral-950 p-6">
        <div class="flex">
          <div class="w-1/4 bg-white p-4 rounded-lg shadow-md">
            <h2 class="text-xl font-bold mb-4">Saved RSS Feeds</h2>
            <ul class="space-y-2">
              <a href="/all-rss" class="block">
                <div class="flex items-center h-1">
                  <i class="fas fa-rss w-4 h-4 mr-2 text-orange-500"></i>
                  <span class="text-white hover:underline">All RSS</span>
                </div>
              </a>
              ${feeds.map(feed => `
                <a href="/rss/${feed.id}" class="block">
                  <div class="flex items-center h-1">
                    <i class="fas fa-rss w-4 h-4 mr-2 text-orange-500"></i>
                    <span class="text-white hover:underline">${feed.title || feed.url}</span>
                  </div>
                </a>
              `).join('')}
            </ul>
          </div>
          <div class="border-l-2 border-white"></div> <!-- White line -->
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full bg-zinc-900 p-6 rounded-lg shadow-md ml-4">
            ${htmlContent}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching saved RSS feeds');
  }
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});