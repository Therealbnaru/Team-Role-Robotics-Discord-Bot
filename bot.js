import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

const TEAM_REGEX = /^\d+[A-Za-z]$/;
const TEAM_CHANNELS = ['general', 'building', 'notebooking', 'programming'];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

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

  await removeOldTeamRoles(member, teamNumber);
  await syncTeamChannels(member.guild, role, teamNumber);

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role);
    console.log(`Added ${member.displayName} to ${teamNumber}`);
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

client.login(process.env.DISCORD_TOKEN);