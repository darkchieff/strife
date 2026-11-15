import { FluxDispatcher, ReactNative } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { enable, payload } from "./snippet";

// If we're already logged in, enable right away. Otherwise wait until Discord has connected
findByStoreName("UserStore")?.getCurrentUser?.() ? enable() : FluxDispatcher.subscribe("CONNECTION_OPEN", payload);

export const onUnload = () => {
    // Don't leave a dangling listener if we're disabled before the connection ever opened
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", payload);

    showConfirmationAlert({
        title: "Wait!",
        content: "Disabling experiments requires a restart - would you like to do that now?",
        confirmText: "Sure",
        cancelText: "Not now",
        // @ts-expect-error oh god
        confirmColor: "red",
        onConfirm: () => ReactNative.NativeModules.BundleUpdaterManager.reload(),
    });
};
