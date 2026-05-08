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

const fs = require("fs");

const TOKEN = process.env.TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ===== DATA =====
let konkursy = {};
let historia = [];

if (fs.existsSync("konkursy.json")) {
    konkursy = JSON.parse(fs.readFileSync("konkursy.json"));
}
if (fs.existsSync("historia.json")) {
    historia = JSON.parse(fs.readFileSync("historia.json"));
}

function save() {
    fs.writeFileSync("konkursy.json", JSON.stringify(konkursy, null, 2));
    fs.writeFileSync("historia.json", JSON.stringify(historia, null, 2));
}

// ===== TIME =====
function parseTime(input) {
    const match = input.match(/(\d+)([mhd])/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const type = match[2];

    if (type === "m") return value * 60000;
    if (type === "h") return value * 3600000;
    if (type === "d") return value * 86400000;
}

// ===== READY =====
client.once("ready", async () => {
    console.log(`Bot działa 🔥 (${client.user.tag})`);

    const commands = [
        new SlashCommandBuilder().setName("konkurs").setDescription("Tworzy konkurs"),

        new SlashCommandBuilder()
            .setName("konkurslist")
            .setDescription("Lista uczestników")
            .addStringOption(opt =>
                opt.setName("nazwa").setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkursusun")
            .setDescription("Usuń gracza")
            .addStringOption(opt =>
                opt.setName("nazwa").setRequired(true)
            )
            .addUserOption(opt =>
                opt.setName("gracz").setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkursinfo")
            .setDescription("Info o konkursie")
            .addStringOption(opt =>
                opt.setName("nazwa").setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkurshistoria")
            .setDescription("Historia konkursów")
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
                new TextInputBuilder().setCustomId("name").setLabel("Nazwa konkursu").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("reward").setLabel("Nagroda").setStyle(TextInputStyle.Short)
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
        const reward = interaction.fields.getTextInputValue("reward");
        const winners = parseInt(interaction.fields.getTextInputValue("winners"));
        const timeInput = interaction.fields.getTextInputValue("time");
        const desc = interaction.fields.getTextInputValue("desc");

        const duration = parseTime(timeInput);
        if (!duration) return interaction.reply({ content: "❌ Zły format czasu", ephemeral: true });

        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setDescription(
`╭━━━━━━━━━━━━━━━━━━━━╮
🎁 **Nagroda:** ${reward}
🏆 **Wygrywa:** ${winners}
👥 **Uczestnicy:** 0
⏰ **Czas:** ${timeInput}
╰━━━━━━━━━━━━━━━━━━━━╯

✨ ${desc}
🔥 **Status: TRWA**`
            )
            .setColor("#FFD700")
            .setFooter({ text: "Kliknij aby dołączyć 🎯" })
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId(`join_${name}`)
            .setLabel("🎯 Dołącz")
            .setStyle(ButtonStyle.Success);

        const msg = await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)],
            fetchReply: true
        });

        konkursy[name] = {
            reward,
            participants: [],
            winners,
            endTime,
            desc,
            channelId: interaction.channel.id
        };

        save();

        // TIMER
        const interval = setInterval(async () => {
            const k = konkursy[name];
            if (!k) return clearInterval(interval);

            const left = k.endTime - Date.now();
            if (left <= 0) return;

            let timeText;
            if (left < 60000) timeText = `${Math.floor(left / 1000)}s`;
            else if (left < 3600000) {
                const m = Math.floor(left / 60000);
                const s = Math.floor((left % 60000) / 1000);
                timeText = `${m}m ${s}s`;
            } else {
                const h = Math.floor(left / 3600000);
                const m = Math.floor((left % 3600000) / 60000);
                timeText = `${h}h ${m}m`;
            }

            const updated = new EmbedBuilder()
                .setTitle(`🎉 ${name}`)
                .setDescription(
`🎁 ${reward}
👥 ${k.participants.length} osób
⏰ ${timeText}
🏆 ${winners}

${desc}
🔥 TRWA`
                )
                .setColor("#FFD700");

            msg.edit({ embeds: [updated] }).catch(() => {});
        }, 1000);

        // END
        setTimeout(async () => {
            const k = konkursy[name];
            if (!k) return;

            const win = k.participants
                .sort(() => 0.5 - Math.random())
                .slice(0, k.winners);

            historia.push({ name, winners: win });
            save();

            const channel = await client.channels.fetch(k.channelId);

            await channel.send(
                `🏁 KONIEC **${name}**\n🏆 ${win.map(x => `<@${x}>`).join(", ") || "brak"}`
            );

            delete konkursy[name];
            save();

        }, duration);
    }

    // JOIN
    if (interaction.isButton()) {

        const [_, name] = interaction.customId.split("_");
        const k = konkursy[name];
        if (!k) return;

        if (k.participants.includes(interaction.user.id)) {
            return interaction.reply({ content: "Już jesteś 😏", ephemeral: true });
        }

        k.participants.push(interaction.user.id);
        save();

        return interaction.reply({ content: "Dołączyłeś!", ephemeral: true });
    }

    // LIST
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurslist") {
        const name = interaction.options.getString("nazwa");
        const k = konkursy[name];

        if (!k) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        return interaction.reply({
            content: k.participants.map(x => `<@${x}>`).join("\n") || "brak",
            ephemeral: true
        });
    }

    // INFO
    if (interaction.isChatInputCommand() && interaction.commandName === "konkursinfo") {
        const name = interaction.options.getString("nazwa");
        const k = konkursy[name];

        if (!k) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        return interaction.reply({
            content: `🎉 ${name}\n🎁 ${k.reward}\n👥 ${k.participants.length}`,
            ephemeral: true
        });
    }

    // HISTORIA
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurshistoria") {

        if (historia.length === 0)
            return interaction.reply("Brak historii");

        return interaction.reply(
            historia.map(x => `🎉 ${x.name}`).join("\n")
        );
    }

    // USUŃ
    if (interaction.isChatInputCommand() && interaction.commandName === "konkursusun") {

        const name = interaction.options.getString("nazwa");
        const user = interaction.options.getUser("gracz");

        const k = konkursy[name];
        if (!k) return interaction.reply({ content: "❌ Brak", ephemeral: true });

        k.participants = k.participants.filter(x => x !== user.id);
        save();

        return interaction.reply({
            content: `✅ Usunięto ${user.tag}`,
            ephemeral: true
        });
    }
});

// START
client.login(TOKEN);
