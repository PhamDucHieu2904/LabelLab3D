# Properties artwork entry design

The Studio should expose artwork upload from the Properties panel instead of a
separate Artwork tool. Remove the Artwork rail button and its sidebar panel;
place one compact `Add your artwork` button at the top of Properties, before
the Cap/Bottle/Label tabs. The existing Choose artwork modal, IndexedDB saved
artwork library, crop behavior, and artwork editing pause behavior remain
unchanged.

The library component stays mounted with the Properties panel so changing
tools does not reset saved-artwork restoration. Its visible sidebar content is
reduced to the CTA and any storage error; the current artwork preview and
remove/restore controls are removed from the sidebar.
