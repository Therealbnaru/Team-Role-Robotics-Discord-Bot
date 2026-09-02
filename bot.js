import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import * as readline from 'node:readline';
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

const TEAM_REGEX = /^\d+[A-Za-z]$/;
const TEAM_CHANNELS = ['general', 'building', 'notebooking', 'programming'];
const MEMBER_ROLE_NAME = 'Member 2026-2027';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});


const ENV_FILE = new URL('.env', import.meta.url);

async function promptForDiscordToken() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'DISCORD_TOKEN is missing. Add it to .env when running the bot non-interactively.'
    );
  }

  console.log('No Discord token was found. It will be saved locally in .env.');
  process.stdout.write('Enter your Discord bot token: ');

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = input.isRaw;

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();

    let token = '';

    const cleanup = () => {
      input.off('keypress', onKeypress);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
    };

    const onKeypress = (character, key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.stdout.write('\n');
        reject(new Error('Token setup cancelled.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        process.stdout.write('\n');
        resolve(token.trim());
        return;
      }

      if (key.name === 'backspace') {
        token = token.slice(0, -1);
        return;
      }

      if (character && !key.ctrl && !key.meta) {
        token += character;
      }
    };

    input.on('keypress', onKeypress);
  });
}

async function saveDiscordToken(token) {
  let envContents = '';

  try {
    envContents = await readFile(ENV_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const tokenLine = `DISCORD_TOKEN=${token}`;

  if (/^DISCORD_TOKEN=.*$/m.test(envContents)) {
    envContents = envContents.replace(/^DISCORD_TOKEN=.*$/m, tokenLine);
  } else {
    const separator = envContents && !envContents.endsWith('\n') ? '\n' : '';
    envContents = `${envContents}${separator}${tokenLine}\n`;
  }

  await writeFile(ENV_FILE, envContents, { mode: 0o600 });
  process.env.DISCORD_TOKEN = token;
}

async function getDiscordToken() {
  const savedToken = process.env.DISCORD_TOKEN?.trim();

  if (savedToken) {
    return savedToken;
  }

  const token = await promptForDiscordToken();

  if (!token) {
    throw new Error('A Discord bot token is required.');
  }

  await saveDiscordToken(token);
  console.log('Discord token saved locally. Future starts will use it automatically.');

  return token;
}

function getTeamFromName(name) {
  const match = name.match(/\|\s*(\d+[A-Za-z])$/);
  return match ? match[1].toUpperCase() : null;
}

async function removeOldTeamRoles(member, currentTeamNumber) {
  for (const role of member.roles.cache.values()) {
    if (TEAM_REGEX.test(role.name) && role.name.toUpperCase() !== currentTeamNumber) {
      await member.roles.remove(role);
      console.log(`Removed old team role ${role.name} from ${member.displayName}`);
    }
  }
}

async function getOrCreateTeamRole(guild, teamNumber) {
  let role = guild.roles.cache.find(
    r => r.name.toUpperCase() === teamNumber
  );

  if (!role) {
    role = await guild.roles.create({
      name: teamNumber,
      reason: `Created team role for ${teamNumber}`,
    });

    console.log(`Created role: ${teamNumber}`);
  }

  return role;
}

async function getOrCreateTeamCategory(guild, role, teamNumber) {
  let categories = guild.channels.cache.filter(
    channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name.toUpperCase() === teamNumber
  );

  let category = categories.first();

  if (!category) {
    category = await guild.channels.create({
      name: teamNumber,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    console.log(`Created category: ${teamNumber}`);
    await guild.channels.fetch();
  }

  return category;
}

async function deleteDuplicateTeamCategories(guild, keepCategory, teamNumber) {
  const duplicateCategories = guild.channels.cache.filter(
    channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name.toUpperCase() === teamNumber &&
      channel.id !== keepCategory.id
  );

  for (const duplicateCategory of duplicateCategories.values()) {
    console.log(`Deleting duplicate category: ${duplicateCategory.name}`);

    const children = guild.channels.cache.filter(
      child => child.parentId === duplicateCategory.id
    );

    for (const child of children.values()) {
      await child.delete(`Deleting duplicate team channel for ${teamNumber}`);
      console.log(`Deleted duplicate child channel: ${child.name}`);
    }

    await duplicateCategory.delete(`Deleting duplicate team category for ${teamNumber}`);
    console.log(`Deleted duplicate category: ${duplicateCategory.name}`);

    await guild.channels.fetch();
  }
}

async function syncTeamChannels(guild, role, teamNumber) {
  const category = await getOrCreateTeamCategory(guild, role, teamNumber);

  await deleteDuplicateTeamCategories(guild, category, teamNumber);

  for (const channelName of TEAM_CHANNELS) {
    let matchingChannels = guild.channels.cache.filter(
      channel =>
        channel.parentId === category.id &&
        channel.type === ChannelType.GuildText &&
        channel.name === channelName
    );

    let mainChannel = matchingChannels.first();

    if (!mainChannel) {
      mainChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: role.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      });

      console.log(`Created channel: ${teamNumber} / ${channelName}`);
      await guild.channels.fetch();
    }

    matchingChannels = guild.channels.cache.filter(
      channel =>
        channel.parentId === category.id &&
        channel.type === ChannelType.GuildText &&
        channel.name === channelName
    );

    const duplicateChannels = matchingChannels.filter(
      channel => channel.id !== mainChannel.id
    );

    for (const duplicate of duplicateChannels.values()) {
      await duplicate.delete(`Deleting duplicate ${channelName} channel for ${teamNumber}`);
      console.log(`Deleted duplicate channel: ${teamNumber} / ${channelName}`);
      await guild.channels.fetch();
    }
  }
}

async function assignTeamRole(member) {
  const teamNumber = getTeamFromName(member.displayName);

  if (!teamNumber) {
    return;
  }

  const role = await getOrCreateTeamRole(member.guild, teamNumber);
  const memberRole = member.guild.roles.cache.find(
    guildRole => guildRole.name.toLowerCase() === MEMBER_ROLE_NAME.toLowerCase()
  );

  await removeOldTeamRoles(member, teamNumber);
  await syncTeamChannels(member.guild, role, teamNumber);

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role);
    console.log(`Added ${member.displayName} to ${teamNumber}`);
  }

  if (!memberRole) {
    console.error(`Could not find the ${MEMBER_ROLE_NAME} role in ${member.guild.name}`);
  } else if (!member.roles.cache.has(memberRole.id)) {
    await member.roles.add(memberRole);
    console.log(`Added ${MEMBER_ROLE_NAME} to ${member.displayName}`);
  }
}

async function cleanupUnusedTeams(guild, members) {
  console.log(`Cleaning unused teams in ${guild.name}`);

  const activeTeams = new Set();

  for (const member of members.values()) {
    if (member.user.bot) continue;

    const teamNumber = getTeamFromName(member.displayName);

    if (teamNumber) {
      activeTeams.add(teamNumber);
    }
  }

  console.log("Active teams:", [...activeTeams]);

  for (const channel of guild.channels.cache.values()) {
    const isTeamCategory =
      channel.type === ChannelType.GuildCategory &&
      TEAM_REGEX.test(channel.name);

    if (!isTeamCategory) continue;

    const teamNumber = channel.name.toUpperCase();

    if (!activeTeams.has(teamNumber)) {
      console.log(`Deleting unused category: ${teamNumber}`);

      const childChannels = guild.channels.cache.filter(
        child => child.parentId === channel.id
      );

      for (const child of childChannels.values()) {
        await child.delete(`Deleting unused team channel for ${teamNumber}`);
        console.log(`Deleted unused channel: ${child.name}`);
      }

      await channel.delete(`Deleting unused team category for ${teamNumber}`);
      console.log(`Deleted unused category: ${teamNumber}`);

      await guild.channels.fetch();
    }
  }

  for (const role of guild.roles.cache.values()) {
    if (!TEAM_REGEX.test(role.name)) continue;

    const teamNumber = role.name.toUpperCase();

    if (!activeTeams.has(teamNumber)) {
      try {
        await role.delete(`Deleting unused team role for ${teamNumber}`);
        console.log(`Deleted unused role: ${teamNumber}`);
      } catch (error) {
        console.error(`Could not delete role ${teamNumber}:`, error);
      }
    }
  }

  console.log(`Finished cleaning unused teams in ${guild.name}`);
}

async function scanGuild(guild) {
  console.log(`Checking server: ${guild.name}`);

  const members = await guild.members.fetch();
  await guild.channels.fetch();

  for (const member of members.values()) {
    if (member.user.bot) continue;
    await assignTeamRole(member);
  }

  await cleanupUnusedTeams(guild, members);

  console.log(`Finished checking ${guild.name}`);
}

let scanTimeout = null;

function scheduleScan(guild) {
  if (scanTimeout) clearTimeout(scanTimeout);

  scanTimeout = setTimeout(async () => {
    try {
      await scanGuild(guild);
    } catch (error) {
      console.error("Failed scheduled scan:", error);
    }
  }, 30000);
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    try {
      await scanGuild(guild);
    } catch (error) {
      console.error(`Failed to scan ${guild.name}:`, error);
    }
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.displayName !== newMember.displayName) {
    await assignTeamRole(newMember);
    scheduleScan(newMember.guild);
  }
});

client.on('guildMemberAdd', async (member) => {
  await assignTeamRole(member);
  scheduleScan(member.guild);
});

try {
  const discordToken = await getDiscordToken();
  await client.login(discordToken);
} catch (error) {
  console.error(`Could not start the bot: ${error.message}`);
  process.exitCode = 1;
}