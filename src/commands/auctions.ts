import {
    Client,
    CommandInteraction,
    EmbedBuilder,
    InteractionContextType,
    SlashCommandBuilder,
} from 'discord.js'

export const command = new SlashCommandBuilder()
    .setName('auctions')
    .setDescription(`Get useful information about Top.gg's Auctions.`)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions('0')

export const execute = async (
    _client: Client,
    interaction: CommandInteraction
) => {
    //(2022-02-19 Marco): I ripped this code straight from V1, blame Luke for this
    //(2025-02-23 Marco): I did it again
    //(2025-03-18 Luke):  Good, because I don't fucking remember how this works <3

    const nextMonday = new Date();
    // checks if today isn't monday
    if (nextMonday.getDay() !== 1) {
        nextMonday.setDate(nextMonday.getDate() + (((8 - nextMonday.getDay()) % 7) || 7));
    }
    nextMonday.setHours(19);
    nextMonday.setMinutes(0);

    // checks if today isnt tuesday
    const nextTuesday = new Date();
    if (nextTuesday.getDay() !== 2) {
        nextTuesday.setDate(nextTuesday.getDate() + (((9 - nextTuesday.getDay()) % 7) || 7));
    }
    nextTuesday.setHours(16);
    nextTuesday.setMinutes(0);

    const embed = new EmbedBuilder()
        .setTitle("Auctions Information")
        .setDescription("You can find out more about Top.gg auctions on the [Auctions Support Article](https://support.top.gg/support/solutions/articles/73000508264-how-do-i-use-auctions-)")
        .addFields({ name: "Next Auction starts at", value: `<t:${Math.floor(nextTuesday.getTime() / 1000)}:f> (<t:${Math.floor(nextTuesday.getTime() / 1000)}:R>)` },
            { name: "Current Auction ends at", value: `<t:${Math.floor(nextMonday.getTime() / 1000)}:f> (<t:${Math.floor(nextMonday.getTime() / 1000)}:R>)` },
            { name: "Ads from current auction start going live at", value: `<t:${Math.floor(nextTuesday.getTime() / 1000)}:f> (<t:${Math.floor(nextTuesday.getTime() / 1000)}:R>)` }
        )
        .setColor('#ff3366');

    interaction.reply({ embeds: [embed] });

}
