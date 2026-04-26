import supportArticles from '../data/supportArticles.json'
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  InteractionContextType,
  InteractionReplyOptions,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { errorEmbed } from '../utils/embeds'
import { isStaffReminderEligibleInteraction } from '../utils/tickets/staffTicketReminders'

type SupportArticle = {
  name: string
  description: string
  link: string
}

const articles = supportArticles as Array<SupportArticle>
const MAX_AUTOCOMPLETE_RESULTS = 25
const MAX_CHOICE_NAME_LENGTH = 100
const AUTOCOMPLETE_VALUE_PREFIX = 'article:'

function normalizeArticleName(value: string): string {
  return value.trim().toLowerCase()
}

function getArticleChoiceValue(index: number): string {
  return `${AUTOCOMPLETE_VALUE_PREFIX}${index}`
}

function truncateChoiceName(value: string): string {
  if (value.length <= MAX_CHOICE_NAME_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_CHOICE_NAME_LENGTH - 3)}...`
}

function findArticleByOptionValue(value: string): SupportArticle | undefined {
  if (!value.startsWith(AUTOCOMPLETE_VALUE_PREFIX)) {
    return findArticleByName(value)
  }

  const rawIndex = value.slice(AUTOCOMPLETE_VALUE_PREFIX.length)
  const parsedIndex = Number.parseInt(rawIndex, 10)

  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
    return undefined
  }

  return articles[parsedIndex]
}

function findArticleByName(value: string): SupportArticle | undefined {
  const normalizedValue = normalizeArticleName(value)
  return articles.find(
    (article) => normalizeArticleName(article.name) === normalizedValue
  )
}

function getAutocompleteMatches(value: string): Array<SupportArticle> {
  const normalizedValue = normalizeArticleName(value)
  if (!normalizedValue) {
    return articles.slice(0, MAX_AUTOCOMPLETE_RESULTS)
  }

  return articles
    .filter((article) => {
      const normalizedName = normalizeArticleName(article.name)
      const normalizedDescription = normalizeArticleName(article.description)
      return (
        normalizedName.includes(normalizedValue) ||
        normalizedDescription.includes(normalizedValue)
      )
    })
    .slice(0, MAX_AUTOCOMPLETE_RESULTS)
}

export const command = new SlashCommandBuilder()
  .setName('support')
  .setDescription('Share a support article')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('article')
      .setDescription('The support article to share')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Optional user to mention with the article')
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName('ephemeral')
      .setDescription('Whether the response should only be visible to you')
      .setRequired(false)
  )

export const autocomplete = async (
  _client: Client,
  interaction: AutocompleteInteraction
): Promise<void> => {
  const focusedValue = interaction.options.getFocused()
  const matches = getAutocompleteMatches(focusedValue)

  await interaction.respond(
    matches.map((article) => ({
      name: truncateChoiceName(article.name),
      value: getArticleChoiceValue(articles.indexOf(article)),
    }))
  )
}

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!(await isStaffReminderEligibleInteraction(interaction))) {
    await interaction.reply({
      embeds: [errorEmbed('Only staff members can use this command.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const articleValue = interaction.options.getString('article', true)
  const article = findArticleByOptionValue(articleValue)

  if (!article) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'That support article was not found. Pick one from the autocomplete list.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const targetUser = interaction.options.getUser('user')
  const isEphemeral = interaction.options.getBoolean('ephemeral') ?? false

  const embed = new EmbedBuilder()
    .setTitle(article.name)
    .setDescription(article.description)
    .setColor('#3BA55D')
    .addFields({ name: 'Article', value: article.link })

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Open article')
      .setStyle(ButtonStyle.Link)
      .setURL(article.link)
  )

  const replyOptions: InteractionReplyOptions = {
    embeds: [embed],
    components: [row],
    allowedMentions: targetUser ? { users: [targetUser.id] } : { parse: [] },
  }

  if (targetUser) {
    replyOptions.content = `${targetUser}`
  }

  if (isEphemeral) {
    replyOptions.flags = MessageFlags.Ephemeral
  }

  await interaction.reply(replyOptions)
}