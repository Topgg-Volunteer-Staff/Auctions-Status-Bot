import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ContainerBuilder,
  RepliableInteraction,
  TextDisplayBuilder,
} from 'discord.js'

import { COMPONENTS_V2_EPHEMERAL_FLAGS } from './componentsV2'
import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from './db/mongoBackedJsonStore'
import { emoji } from './emojis'
import { sendMongoErrorLog } from './errorLogging'

const CUSTOM_ALERT_STORE_KEY = 'custom-alert'
const CUSTOM_ALERT_ACCENT_COLOR = 0xffcc00

export type CustomAlertState = {
  message: string | null
  title: string | null
  visible: boolean
  updatedBy: string | null
  updatedAt: number | null
}

const DEFAULT_STATE: CustomAlertState = {
  message: null,
  title: null,
  visible: false,
  updatedBy: null,
  updatedAt: null,
}

let currentState: CustomAlertState = { ...DEFAULT_STATE }
let alertClient: Client | null = null
let initPromise: Promise<void> | null = null

function sanitizeLoadedState(value: unknown): CustomAlertState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_STATE }

  const candidate = value as Partial<CustomAlertState>

  return {
    message: typeof candidate.message === 'string' ? candidate.message : null,
    title: typeof candidate.title === 'string' ? candidate.title : null,
    visible: candidate.visible === true,
    updatedBy:
      typeof candidate.updatedBy === 'string' ? candidate.updatedBy : null,
    updatedAt:
      typeof candidate.updatedAt === 'number' ? candidate.updatedAt : null,
  }
}

async function persistState(): Promise<void> {
  try {
    await saveMongoBackedJson(CUSTOM_ALERT_STORE_KEY, currentState, {
      operation: 'persist',
    })
  } catch (error) {
    if (alertClient) {
      void sendMongoErrorLog(alertClient, 'customAlert.persist.failed', error)
    }
    throw error
  }
}

export async function initializeCustomAlertStore(client: Client): Promise<void> {
  alertClient = client
  if (initPromise) return initPromise

  initPromise = (async () => {
    const loaded = await loadMongoBackedJson<unknown>(
      CUSTOM_ALERT_STORE_KEY,
      DEFAULT_STATE
    )
    currentState = sanitizeLoadedState(loaded)
  })()

  return initPromise
}

export function getCustomAlertState(): CustomAlertState {
  return { ...currentState }
}

export function getActiveCustomAlert(): CustomAlertState | null {
  if (!currentState.visible || !currentState.message) return null
  return { ...currentState }
}

export async function setCustomAlert(options: {
  message: string
  title: string | null
  updatedBy: string
}): Promise<void> {
  currentState = {
    message: options.message,
    title: options.title,
    visible: true,
    updatedBy: options.updatedBy,
    updatedAt: Date.now(),
  }
  await persistState()
}

export async function editCustomAlert(options: {
  message: string
  title: string | null
  updatedBy: string
}): Promise<void> {
  currentState = {
    ...currentState,
    message: options.message,
    title: options.title,
    updatedBy: options.updatedBy,
    updatedAt: Date.now(),
  }
  await persistState()
}

export async function setCustomAlertVisibility(
  visible: boolean,
  updatedBy: string
): Promise<void> {
  currentState = {
    ...currentState,
    visible,
    updatedBy,
    updatedAt: Date.now(),
  }
  await persistState()
}

export async function clearCustomAlert(updatedBy: string): Promise<void> {
  currentState = {
    ...DEFAULT_STATE,
    updatedBy,
    updatedAt: Date.now(),
  }
  await persistState()
}

export function createCustomAlertContainer(): ContainerBuilder | null {
  const alert = getActiveCustomAlert()
  if (!alert || !alert.message) return null

  const heading = alert.title
    ? `## ${emoji.warning} ${alert.title}`
    : `## ${emoji.warning} Known Issue`

  return new ContainerBuilder()
    .setAccentColor(CUSTOM_ALERT_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(heading),
      new TextDisplayBuilder().setContent(`**${alert.message}**`)
    )
}

function createOutageConfirmationPanel(
  continueCustomId: string
): ContainerBuilder | null {
  const alert = getActiveCustomAlert()
  if (!alert || !alert.message) return null

  const heading = alert.title
    ? `## ${emoji.warning} ${alert.title}`
    : `## ${emoji.warning} Known Issue`

  const continueButton = new ButtonBuilder()
    .setCustomId(continueCustomId)
    .setLabel("My issue isn't related to this")
    .setStyle(ButtonStyle.Secondary)

  return new ContainerBuilder()
    .setAccentColor(CUSTOM_ALERT_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(heading),
      new TextDisplayBuilder().setContent(`**${alert.message}**`),
      new TextDisplayBuilder().setContent(
        "If your issue isn't related to this, you can continue below."
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(continueButton)
    )
}

/**
 * Replies to the interaction with the active alert and a button to confirm
 * the ticket should still be opened. Returns true if the caller should stop
 * (the ticket flow now continues from the button's own handler instead).
 */
export async function promptAlertConfirmationIfActive(
  interaction: RepliableInteraction,
  continueCustomId: string
): Promise<boolean> {
  const panel = createOutageConfirmationPanel(continueCustomId)
  if (!panel) return false

  await interaction.reply({
    components: [panel],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
  return true
}
