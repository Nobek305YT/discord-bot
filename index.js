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

// ================= TOKEN =================
const TOKEN = process.env.TOKEN;

// ================= CLIENT (MUSI BYĆ NA GÓRZE!) =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= KONKURSY =================
let konkursy = {};

// ================= TIME PARSER =================
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

// ================= READY =================
client.once("ready", async () => {
    console.log(`Bot działa 🔥 (${client.user.tag})`);

    const commands = [
        new SlashCommandBuilder()
            .setName("konkurs")
            .setDescription("Tworzy konkurs"),

        new SlashCommandBuilder()
            .setName("konkurslist")
            .setDescription("Lista uczestników")
            .addStringOption(opt =>
                opt.setName("nazwa")
                    .setDescription("Nazwa konkursu")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkursusun")
            .setDescription("Usuń gracza z konkursu")
            .addStringOption(opt =>
                opt.setName("nazwa")
                    .setDescription("Nazwa konkursu")
                    .setRequired(true)
            )
            .addUserOption(opt =>
                opt.setName("gracz")
                    .setDescription("Gracz")
                    .setRequired(true)
            )
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );

    console.log("Slash OK ✔");
});

// ================= INTERACTIONS =================
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
                new TextInputBuilder().setCustomId("winners").setLabel("Wygrywa ile osób").setStyle(TextInputStyle.Short)
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

        const duration = parseTime(timeInput);
        if (!duration) return interaction.reply({ content: "❌ zły czas", ephemeral: true });

        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setDescription(`👥 0 uczestników\n⏰ ${timeInput}\n🏆 ${winners} wygrywa\n\n${desc}`)
            .setColor("Gold");

        const button = new ButtonBuilder()
            .setCustomId(`join_${name}`)
            .setLabel("Wejdź")
            .setStyle(ButtonStyle.Success);

        const msg = await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)],
            fetchReply: true
        });

        konkursy[name] = {
            participants: [],
            winners,
            endTime,
            msg,
            desc
        };

        // TIMER
        const interval = setInterval(async () => {
            const k = konkursy[name];
            if (!k) return clearInterval(interval);

            const left = k.endTime - Date.now();
            if (left <= 0) return;

            const h = Math.floor(left / 3600000);
            const m = Math.floor((left % 3600000) / 60000);
            const s = Math.floor((left % 60000) / 1000);

            let timeText = left < 60000 ? `${s}s` : left < 3600000 ? `${m}m ${s}s` : `${h}h ${m}m`;

            const updated = new EmbedBuilder()
                .setTitle(`🎉 ${name}`)
                .setDescription(`👥 ${k.participants.length} uczestników\n⏰ ${timeText}\n🏆 ${winners} wygrywa\n\n${desc}`)
                .setColor("Gold");

            msg.edit({ embeds: [updated] }).catch(() => {});
        }, 1000);

        setTimeout(async () => {

            const k = konkursy[name];
            if (!k) return;

            const win = k.participants
                .sort(() => 0.5 - Math.random())
                .slice(0, k.winners);

            const channel = await client.channels.fetch(interaction.channel.id);

            channel.send(`🏁 KONIEC\n🏆 Wygrani: ${win.map(x => `<@${x}>`).join(", ") || "brak"}`);

            delete konkursy[name];

        }, duration);
    }

    // ===== BUTTON JOIN =====
    if (interaction.isButton()) {

        const [action, name] = interaction.customId.split("_");
        const k = konkursy[name];
        if (!k) return;

        if (action !== "join") return;

        const id = interaction.user.id;

        if (k.participants.includes(id)) {
            return interaction.reply({ content: "Już jesteś 😏", ephemeral: true });
        }

        k.participants.push(id);

        return interaction.reply({ content: "Dołączyłeś!", ephemeral: true });
    }

    // ===== LIST =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurslist") {

        const name = interaction.options.getString("nazwa");
        const k = konkursy[name];

        if (!k) return interaction.reply({ content: "Brak konkursu", ephemeral: true });

        return interaction.reply({
            content: k.participants.map(x => `<@${x}>`).join("\n") || "brak",
            ephemeral: true
        });
    }

    // ===== REMOVE USER =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkursusun") {

        const name = interaction.options.getString("nazwa");
        const user = interaction.options.getUser("gracz");

        const k = konkursy[name];
        if (!k) return interaction.reply({ content: "Brak konkursu", ephemeral: true });

        k.participants = k.participants.filter(x => x !== user.id);

        return interaction.reply({
            content: `Usunięto ${user.tag}`,
            ephemeral: true
        });
    }
});

// ================= START =================
client.login(TOKEN);
