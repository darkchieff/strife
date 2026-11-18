(function (exports) {
    // NitroSpoof for Revenge (Vendetta/Bunny plugin format).
    // Port of the Aliucord plugin by Xinto, Foxy, RGBCube, Delphox and Lenk.
    //
    // Loader format: this file is a bare IIFE expression. Revenge wraps it as
    // `vendetta => { return <this file> }`, so `vendetta` is in scope below.

    "use strict";

    const { findByProps, findByStoreName } = vendetta.metro;
    const { before, instead } = vendetta.patcher;
    const { storage } = vendetta.plugin;
    const { useProxy } = vendetta.storage;
    const { React, ReactNative } = vendetta.metro.common;
    const { showToast } = vendetta.ui.toasts;
    const Forms = (vendetta.ui.components && vendetta.ui.components.Forms) || {};

    const EMOTE_SIZE_DEFAULT = "48";
    // <:name:123> or <a:name:123>
    const EMOJI_TOKEN = /<(a?):(\w+):(\d+)>/g;

    // Premium checks that gate the emoji picker. Each one is optional: if a
    // function isn't present in this Discord build it is simply skipped.
    const PICKER_BYPASS = [
        ["canUseEmojisEverywhere", true],
        ["canUseAnimatedEmojis", true],
    ];

    const unpatches = [];
    const status = [];

    const log = (msg) => {
        try { vendetta.logger.log("[NitroSpoof] " + msg); } catch (_) {}
    };
    const safe = (fn) => {
        try { return fn(); } catch (_) { return undefined; }
    };
    const track = (label, unpatch) => {
        unpatches.push(unpatch);
        status.push("OK: " + label);
        log("patched " + label);
    };
    const miss = (label) => {
        status.push("MISSING: " + label);
        log("could not find " + label);
    };

    // Stores are looked up lazily and cached.
    let stores;
    const getStores = () =>
        stores || (stores = {
            user: safe(() => findByStoreName("UserStore")),
            channel: safe(() => findByStoreName("ChannelStore")),
            emoji: safe(() => findByStoreName("EmojiStore")),
        });

    // Nitro Classic (1) and Nitro (2) get external + animated emoji.
    // Nitro Basic (3) does not, so it still needs the link workaround.
    const hasEmojiNitro = () => {
        const user = safe(() => getStores().user.getCurrentUser());
        return !!user && (user.premiumType === 1 || user.premiumType === 2);
    };

    // Would Discord let this emoji through on its own, ignoring our patches?
    const nativelyUsable = (emoji, channelId) => {
        if (!emoji || emoji.available === false) return false;
        const nitro = hasEmojiNitro();
        if (emoji.animated && !nitro) return false;
        if (nitro) return true;
        const channel = safe(() => getStores().channel.getChannel(channelId));
        const guildId = channel && (channel.guild_id || channel.guildId);
        return !!guildId && emoji.guildId === guildId;
    };

    const buildUrl = (id, name, animated) => {
        let url =
            "https://cdn.discordapp.com/emojis/" + id +
            (animated ? ".gif" : ".png") +
            "?quality=lossless&name=" + encodeURIComponent(name);
        // Empty / invalid size => let Discord pick its default.
        const size = parseInt(String(storage.emoteSize == null ? EMOTE_SIZE_DEFAULT : storage.emoteSize), 10);
        if (Number.isFinite(size) && size > 0) {
            url += "&size=" + Math.min(4096, Math.max(16, size));
        }
        return url;
    };

    // Rewrites unusable custom emoji in an outgoing message into CDN links.
    const spoof = (channelId, msg) => {
        if (!msg || typeof msg.content !== "string" || msg.content.indexOf("<") === -1) return;

        const converted = new Set();
        msg.content = msg.content.replace(EMOJI_TOKEN, (match, a, name, id, offset, str) => {
            const emoji = safe(() => getStores().emoji.getCustomEmojiById(id));
            if (emoji && nativelyUsable(emoji, channelId)) return match;

            converted.add(id);
            const url = buildUrl(id, name, a === "a" || (emoji && emoji.animated === true));
            // Keep the link from fusing with neighbouring text.
            const lead = offset > 0 && !/\s/.test(str[offset - 1]) ? " " : "";
            const tail = offset + match.length < str.length && !/\s/.test(str[offset + match.length]) ? " " : "";
            return lead + url + tail;
        });

        if (converted.size === 0) return;
        // Stop Discord from also treating these as emoji it needs to validate.
        const keep = (e) => !(e && converted.has(String(e.id)));
        if (Array.isArray(msg.invalidEmojis)) msg.invalidEmojis = msg.invalidEmojis.filter(keep);
        if (Array.isArray(msg.validNonShortcutEmojis)) msg.validNonShortcutEmojis = msg.validNonShortcutEmojis.filter(keep);
    };

    const install = () => {
        status.length = 0;

        // 1) Outgoing messages: sendMessage / editMessage / uploads with captions.
        const actions = safe(() => findByProps("editMessage", "sendMessage"));
        if (actions) {
            track("sendMessage", before("sendMessage", actions, (args) => spoof(args[0], args[1])));
            track("editMessage", before("editMessage", actions, (args) => spoof(args[0], args[2])));
        } else {
            miss("sendMessage/editMessage");
            safe(() => showToast("NitroSpoof: couldn't hook message sending"));
        }

        const uploads = safe(() => findByProps("uploadLocalFiles"));
        if (uploads) {
            track("uploadLocalFiles", before("uploadLocalFiles", uploads, (args) => {
                const opts = args[0];
                if (opts) spoof(opts.channelId, opts.parsedMessage);
            }));
        } else {
            miss("uploadLocalFiles");
        }

        // 2) Emoji picker / autocomplete: make locked emoji selectable.
        for (const [name, value] of PICKER_BYPASS) {
            const mod = safe(() => findByProps(name));
            if (mod && typeof mod[name] === "function") {
                track(name, instead(name, mod, () => value));
            } else {
                miss(name);
            }
        }
    };

    function Settings() {
        useProxy(storage);

        const h = React.createElement;
        const { ScrollView, TextInput, Text } = ReactNative;
        const { FormSection, FormInput, FormText } = Forms;

        const sizeInput = FormInput
            ? h(FormInput, {
                title: "Emote size",
                placeholder: "Leave empty for Discord default",
                value: String(storage.emoteSize == null ? EMOTE_SIZE_DEFAULT : storage.emoteSize),
                keyboardType: "numeric",
                onChange: (v) => { storage.emoteSize = String(v).replace(/[^0-9]/g, ""); },
            })
            : h(TextInput, {
                placeholder: "Emote size (empty = Discord default)",
                value: String(storage.emoteSize == null ? EMOTE_SIZE_DEFAULT : storage.emoteSize),
                keyboardType: "numeric",
                onChangeText: (v) => { storage.emoteSize = String(v).replace(/[^0-9]/g, ""); },
            });

        const Line = FormText || Text;
        const statusBlock = h(
            FormSection || React.Fragment,
            FormSection ? { title: "Hook status (reload plugin to refresh)" } : null,
            status.length
                ? status.map((s, i) => h(Line, { key: i }, s))
                : h(Line, null, "Plugin not loaded yet.")
        );

        return h(ScrollView, null, sizeInput, statusBlock);
    }

    exports.default = {
        onLoad() {
            if (storage.emoteSize === undefined) storage.emoteSize = EMOTE_SIZE_DEFAULT;
            install();
        },
        onUnload() {
            for (const unpatch of unpatches.splice(0)) safe(unpatch);
        },
        settings: Settings,
    };

    return exports;
})({});
