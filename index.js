const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const TOKEN = process.env.TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let konkursy = {};

// ===== TIME =====
function parseTime(input) {
    const match = input.match(/(\d+)([mhd])/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const type = match[2];

    if (type === "m") return value * 60000;
    if (type === "h") return value * 3600000;
    if (type === "d") return value * 86400000;

    return null;
}

// ===== READY =====
client.once("ready", async () => {
    console.log(`Bot działa 🔥 (${client.user.tag})`);

    const commands = [
        new SlashCommandBuilder().setName("konkurs").setDescription("Tworzy konkurs"),

        new SlashCommandBuilder()
            .setName("konkurslist")
            .setDescription("Lista uczestników")
            .addStringOption(opt => opt.setName("id").setDescription("ID konkursu").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursusun")
            .setDescription("Usuń gracza")
            .addStringOption(opt => opt.setName("id").setDescription("ID konkursu").setRequired(true))
            .addUserOption(opt => opt.setName("gracz").setDescription("Gracz").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursinfo")
            .setDescription("Info o konkursie")
            .addStringOption(opt => opt.setName("id").setDescription("ID konkursu").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursstop")
            .setDescription("Zatrzymaj konkurs")
            .addStringOption(opt => opt.setName("id").setDescription("ID konkursu").setRequired(true)),

        new SlashCommandBuilder()
            .setName("reroll")
            .setDescription("Losuj ponownie zwycięzców")
            .addStringOption(opt => opt.setName("id").setDescription("ID konkursu").setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );

    console.log("Slash OK ✔");
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async interaction => {

    // ===== /KONKURS =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurs") {

        const modal = new ModalBuilder()
            .setCustomId("createKonkurs")
            .setTitle("🎉 Nowy konkurs");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("name").setLabel("Nazwa").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("winners").setLabel("Ile wygrywa").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("time").setLabel("Czas (10m/2h/2d)").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("desc").setLabel("Opis").setStyle(TextInputStyle.Paragraph)
            )
        );

        return interaction.showModal(modal);
    }

    // ===== CREATE =====
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "createKonkurs") {

        const name = interaction.fields.getTextInputValue("name");
        const winners = parseInt(interaction.fields.getTextInputValue("winners"));
        const timeInput = interaction.fields.getTextInputValue("time");
        const desc = interaction.fields.getTextInputValue("desc");

        if (isNaN(winners) || winners <= 0)
            return interaction.reply({ content: "❌ Zła liczba zwycięzców", ephemeral: true });

        const duration = parseTime(timeInput);
        if (!duration)
            return interaction.reply({ content: "❌ Zły czas (10m / 2h / 1d)", ephemeral: true });

        const id = Date.now().toString();
        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setDescription(
`✨ **${desc}**

🆔 ID: **${id}**

╭🏆 Wygrywa: **${winners}**
├👥 Uczestnicy: **0**
├⏰ Czas: **${timeInput}**
╰🔥 Status: **TRWA**`
            )
            .setColor("#FFD700")
            .setFooter({ text: "Kliknij aby dołączyć 🎯" })
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId(`join_${id}`)
            .setLabel("🎯 Dołącz")
            .setStyle(ButtonStyle.Success);

        const msg = await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)],
            fetchReply: true
        });

        konkursy[id] = {
            name,
            participants: [],
            winners,
            endTime,
            msg,
            desc,
            channel: interaction.channel
        };

        // TIMER
        const interval = setInterval(async () => {
            const k = konkursy[id];
            if (!k) return clearInterval(interval);

            const left = k.endTime - Date.now();
            if (left <= 0) return;

            let t = left < 60000
                ? `${Math.floor(left / 1000)}s`
                : left < 3600000
                ? `${Math.floor(left / 60000)}m ${Math.floor((left % 60000)/1000)}s`
                : `${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000)/60000)}m`;

            const updated = EmbedBuilder.from(k.msg.embeds[0])
                .setDescription(
`✨ **${k.desc}**

🆔 ID: **${id}**

╭🏆 Wygrywa: **${k.winners}**
├👥 Uczestnicy: **${k.participants.length}**
├⏰ Zostało: **${t}**
╰🔥 Status: **TRWA**`
                );

            k.msg.edit({ embeds: [updated] }).catch(()=>{});
        }, 5000);

        // END
        setTimeout(() => endKonkurs(id), duration);
    }

    // ===== BUTTON =====
    if (interaction.isButton()) {
        const [_, id] = interaction.customId.split("_");
        const k = konkursy[id];
        if (!k) return;

        if (k.participants.includes(interaction.user.id))
            return interaction.reply({ content: "❌ Już jesteś", ephemeral: true });

        k.participants.push(interaction.user.id);
        return interaction.reply({ content: "✅ Dołączyłeś!", ephemeral: true });
    }

    // ===== LIST =====
    if (interaction.commandName === "konkurslist") {
        const k = konkursy[interaction.options.getString("id")];
        if (!k) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        return interaction.reply({
            content: k.participants.map(x=>`<@${x}>`).join("\n") || "brak",
            ephemeral: true
        });
    }

    // ===== INFO =====
    if (interaction.commandName === "konkursinfo") {
        const id = interaction.options.getString("id");
        const k = konkursy[id];
        if (!k) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        return interaction.reply({
            content:
`🎉 ${k.name}
👥 ${k.participants.length} osób
🏆 ${k.winners} wygrywa
🆔 ${id}`,
            ephemeral: true
        });
    }

    // ===== USUŃ =====
    if (interaction.commandName === "konkursusun") {
        const id = interaction.options.getString("id");
        const user = interaction.options.getUser("gracz");
        const k = konkursy[id];
        if (!k) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        k.participants = k.participants.filter(x => x !== user.id);
        return interaction.reply({ content: "✅ Usunięto", ephemeral: true });
    }

    // ===== STOP =====
    if (interaction.commandName === "konkursstop") {
        const id = interaction.options.getString("id");
        if (!konkursy[id]) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        endKonkurs(id);
        return interaction.reply({ content: "⛔ Konkurs zatrzymany", ephemeral: true });
    }

    // ===== REROLL =====
    if (interaction.commandName === "reroll") {
        const id = interaction.options.getString("id");
        const k = konkursy[id];
        if (!k) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        const win = k.participants
            .sort(() => 0.5 - Math.random())
            .slice(0, k.winners);

        return interaction.reply({
            content: `🎲 Nowi wygrani:\n${win.map(x=>`<@${x}>`).join("\n") || "brak"}`
        });
    }

});

// ===== END FUNCTION =====
async function endKonkurs(id) {
    const k = konkursy[id];
    if (!k) return;

    const win = k.participants
        .sort(() => 0.5 - Math.random())
        .slice(0, k.winners);

    const embed = new EmbedBuilder()
        .setTitle("🏁 KONIEC")
        .setDescription(
`🎉 ${k.name}

🏆 Wygrani:
${win.map(x=>`<@${x}>`).join("\n") || "brak"}

👥 ${k.participants.length} osób`
        )
        .setColor("Red");

    await k.channel.send({ embeds: [embed] }).catch(()=>{});

    const disabled = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Zakończony")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );

    k.msg.edit({ components: [disabled] }).catch(()=>{});

    delete konkursy[id];
}

// ===== START =====
client.login(TOKEN);
