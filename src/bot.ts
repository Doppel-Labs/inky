/**
 * The discord.js gateway adapter for the `/standup` slash command.
 *
 * Thin glue: open a gateway connection, and on each `/standup` interaction adapt
 * the real ChatInputCommandInteraction to the transport-agnostic
 * StandupInteraction the (tested) handler in commands.ts expects. No public URL
 * is needed — the bot connects outbound, so it runs anywhere `serve` runs.
 *
 * Slash-command interactions arrive over the gateway with no privileged intents,
 * so we request only `Guilds`.
 */
import {
  Client,
  Events,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { Config, Secrets } from './config.js';
import { handleStandupCommand, STANDUP_COMMAND_NAME, type StandupInteraction } from './commands.js';

const EMBEDS_PER_MESSAGE = 10;

export interface BotOptions {
  log?: (msg: string) => void;
}

export interface BotHandle {
  stop: () => Promise<void>;
}

/** Connect the gateway bot and start answering `/standup`. */
export async function startBot(
  config: Config,
  secrets: Secrets,
  opts: BotOptions = {},
): Promise<BotHandle> {
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const token = secrets.discordBotToken;
  if (!token) throw new Error('herald: no DISCORD_BOT_TOKEN set for the /standup bot.');

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    log(`herald: bot online as ${c.user.tag}. /${STANDUP_COMMAND_NAME} is ready.`);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== STANDUP_COMMAND_NAME) return;
    await handleStandupCommand(adapt(interaction), config, secrets, { log });
  });

  client.on(Events.Error, (err) => log(`herald: bot error: ${err.message}`));

  await client.login(token);
  return {
    stop: async () => {
      await client.destroy();
      log('herald: bot stopped.');
    },
  };
}

/** Adapt a real discord.js interaction to the handler's narrow view. */
function adapt(interaction: ChatInputCommandInteraction): StandupInteraction {
  return {
    getString: (name) => interaction.options.getString(name),
    getInteger: (name) => interaction.options.getInteger(name),
    getBoolean: (name) => interaction.options.getBoolean(name),
    user: interaction.user.username,
    defer: async () => {
      await interaction.deferReply();
    },
    respond: async (embeds) => {
      // editReply takes the first batch; the rest go as follow-ups (10/message).
      await interaction.editReply({ embeds: embeds.slice(0, EMBEDS_PER_MESSAGE) });
      for (let i = EMBEDS_PER_MESSAGE; i < embeds.length; i += EMBEDS_PER_MESSAGE) {
        await interaction.followUp({ embeds: embeds.slice(i, i + EMBEDS_PER_MESSAGE) });
      }
    },
    respondError: async (message) => {
      await interaction.editReply({ content: message });
    },
  };
}
