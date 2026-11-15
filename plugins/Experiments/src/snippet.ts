import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { logger } from "@vendetta";

// This is in a separate file to make editing easier in future should Discord ever change the method again.
//
// How it works: Discord only turns on its experiment/developer tooling for staff accounts. The two stores
// responsible (ExperimentStore and DeveloperExperimentStore) decide that inside a Flux action handler, so
// we mark the local user as staff and then run those handlers by hand.

const STAFF_FLAG = 1;
const STORE_NAMES = ["ExperimentStore", "DeveloperExperimentStore"];

// Tried in order, per store. OVERLAY_INITIALIZE is the long-standing one; CONNECTION_OPEN is the fallback
// for builds where that handler no longer exists or throws.
const ACTIONS = ["OVERLAY_INITIALIZE", "CONNECTION_OPEN"];

type Handler = { name: string; actionHandler: (payload?: any) => void; storeDidChange?: () => void };

// Discord has moved things around in the dispatcher before, so look in more than one place.
function getHandlers(action: string): Handler[] {
    const handlers = (FluxDispatcher as any)._actionHandlers;
    if (!handlers) return [];

    // Newer + older builds: ordered handlers for one action, each already holding the function for that action
    if (typeof handlers._computeOrderedActionHandlers === "function") {
        try {
            const ordered: Handler[] = handlers._computeOrderedActionHandlers(action) ?? [];
            if (ordered.length) return ordered;
        } catch (e) {
            logger.warn("_computeOrderedActionHandlers failed, trying the dependency graph...", e);
        }
    }

    // Fallback: every store node, whose actionHandler is an object keyed by action type
    const nodes = handlers._dependencyGraph?.nodes;
    if (!nodes) return [];
    return Object.values<any>(nodes)
        .filter(node => typeof node?.actionHandler?.[action] === "function")
        .map(node => ({
            name: node.name,
            actionHandler: node.actionHandler[action],
            storeDidChange: node.storeDidChange,
        }));
}

// Run `fn` while the UserStore claims the current user is staff, then put everything back exactly as it was.
// DeveloperExperimentStore asks the UserStore (not the payload) whether you're staff, so changing user.flags
// alone isn't always enough anymore.
function withStaffUser<T>(UserStore: any, user: any, fn: () => T): T {
    const methods = ["getCurrentUser", "getNonImpersonatedCurrentUser"].filter(m => typeof UserStore[m] === "function");
    const originals = methods.map(m => ({
        m,
        own: Object.prototype.hasOwnProperty.call(UserStore, m),
        fn: UserStore[m],
    }));

    const staffUser = Object.create(user);
    Object.defineProperty(staffUser, "isStaff", { value: () => true, configurable: true });

    try {
        methods.forEach(m => { UserStore[m] = () => staffUser; });
        return fn();
    } finally {
        originals.forEach(({ m, own, fn }) => {
            if (own) UserStore[m] = fn;
            else delete UserStore[m];
        });
    }
}

export function enable() {
    try {
        const UserStore = findByStoreName("UserStore");
        const user = UserStore?.getCurrentUser?.();
        if (!user) return logger.error("Failed to enable experiments... there is no current user yet.");

        // Add 1 (staff) to local user flags. Bitwise OR so enabling twice (reload, plugin toggled) can't corrupt the flags
        user.flags |= STAFF_FLAG;

        const ran: string[] = [];

        withStaffUser(UserStore, user, () => {
            for (const storeName of STORE_NAMES) {
                for (const action of ACTIONS) {
                    const handler = getHandlers(action).find(h => h.name === storeName);
                    if (!handler) continue;

                    try {
                        handler.actionHandler({ type: action, user, experiments: [] });
                        handler.storeDidChange?.();
                        ran.push(`${storeName}:${action}`);
                        break; // this store is done, don't also run the fallback action
                    } catch (e) {
                        logger.warn(`${storeName} threw on ${action}, trying the next one...`, e);
                    }
                }
            }
        });

        if (!ran.length) logger.error("Failed to enable experiments... couldn't find any usable ExperimentStore handlers.");
        else logger.log(`Enabled experiments via ${ran.join(", ")}`);
    } catch (e) {
        logger.error("Failed to enable experiments...", e);
    }
}

export function payload() {
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", payload);
    enable();
}
