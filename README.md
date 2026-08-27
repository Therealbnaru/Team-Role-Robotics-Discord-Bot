# Robotics Team Management Discord Bot

A Discord.js bot that keeps a robotics team's server organized from member nicknames. When a member's display name ends in a team identifier such as `1234A`, the bot assigns the matching role and provisions a private workspace for that team.

## Features

- Detects VEX-style team identifiers from display names formatted like `Name | 1234A`
- Creates a team role when one does not already exist
- Assigns the correct role and removes stale team-number roles
- Creates a private category for each active team
- Creates `general`, `building`, `notebooking`, and `programming` channels inside each category
- Removes duplicate team categories/channels
- Cleans up roles and categories for teams that no longer have members
- Re-scans after member joins and nickname changes

## Tech stack

- Node.js 18+
- JavaScript (ES modules)
- Discord.js 14
- dotenv

## How it works

`bot.js` is the production entry point. On startup, it scans every connected server, fetches members and channels, derives active team numbers from display names, and synchronizes Discord roles and private channel categories.

A 30-second debounced scan follows member joins and display-name changes. Team channels deny `ViewChannel` to `@everyone` and grant the matching team role permission to view, post, and read message history.

## Setup

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/Therealbnaru/Team-Role-Robotics-Discord-Bot.git
cd Team-Role-Robotics-Discord-Bot
npm install
```

2. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).

3. Enable the **Server Members Intent** for the bot. Invite it with permissions to manage roles and channels.

4. Copy the example environment file and add the bot token:

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_bot_token
```

5. Start the bot:

```bash
npm start
```

## Usage

Set each robotics member's server display name so it ends with a pipe and team number:

```text
Bhuvan | 1234A
```

The bot will create the `1234A` role and a private `1234A` category containing the four team channels, then assign the member to that role.

## Required Discord permissions

Place the bot's role above the team roles it manages and grant it:

- Manage Roles
- Manage Channels
- View Channels
- Send Messages
- Read Message History

The privileged **Server Members Intent** must also be enabled because the bot fetches and monitors guild members.

## Project structure

```text
bot.js          Main team-role and channel synchronization service
app.js          Earlier interactions-endpoint prototype
commands.js     Earlier slash-command registration prototype
game.js         Prototype command game logic
utils.js        Helpers used by the interactions prototype
package.json    Runtime configuration and dependencies
```

The team-management workflow runs from `bot.js`; the interaction files are retained as development history and are not required by `npm start`.

## Safety notes

The synchronization process can create and delete Discord roles, categories, and channels whose names match the team-number pattern. Test in a development server first, confirm the bot role hierarchy, and avoid manually naming unrelated categories in the `1234A` format.

## License

MIT
