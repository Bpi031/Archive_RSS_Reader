# Archive RSS Reader

A server for managing and archiving RSS feeds.

## Features

- View all RSS feeds.
- Archive RSS feed items using multiple archive services.

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/Bpi031/rss-feed-reader
    cd rss-feed-reader
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

3. Set up the database:
    ```sh
    npx knex migrate:latest
    ```

## Usage

1. Start the server:
    ```sh
    npm start
    ```

2. Open your browser and navigate to `http://localhost:3000`.

## Endpoints

- `GET /`: View and manage RSS feeds.
- `POST /rss`: Add a new RSS feed URL.
- `POST /delete-rss`: Delete an RSS feed URL.
- `GET /rss/:id`: View items from a specific RSS feed.
- `GET /all-rss`: View all items from all saved RSS feeds.
- `POST /archive`: Archive a specific RSS feed item.

