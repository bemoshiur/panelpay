# Disk detach and destroy

Rules: R13 (destructive lifecycle actions need the right subscription state, a final snapshot where supported, and admin approval until 2026-12-01), R16 (fail closed), R10 (every admin action stores actor, reason, IP and target). Source of the stop rule: the Lightsail API reference of `DetachDisk`, read 2026-11-14 (WPU-Z19): "Detaches a stopped block storage disk from a Lightsail instance. Make sure to unmount any file systems on the device within your operating system before stopping the instance and detaching the disk."

## Trigger

- A customer asks why "Detach disk" is refused, or a `detach_disk` operation of a disk is in `needs_attention` with the last error `conflict`.
- A `destroy` operation of a disk (the end of its subscription, or the customer's own destroy) is in `needs_attention` with the last error `conflict`: the disk is still attached to a server that is not stopped.

## Who

Support for the customer contact; operations (`ops` role) for the operation on `/operations`.

## What the platform does

The disk adapter (`packages/aws/adapters/disk.ts`) never stops a server. Detach and destroy of an attached disk read the live state of the server the disk is attached to and go on only when it is `stopped`; any other state, a server that is not found or an answer without a state is a refusal (`conflict`), so the operation stops in `needs_attention` and nothing is deleted (R16). A disk that is not attached is deleted at once by its destroy (`delete_disk`, after its final snapshot where the lifecycle asks for one). After a DetachDisk, the destroy waits at most 20 minutes for the detach, counted from when the destroy step started (after the approval), never from when the operation was queued (WPU-Y4 fix round 1).

## The order (customer and support)

1. Unmount the filesystem on the server: `sudo umount /data` (the mount point the customer chose), and remove its line from `/etc/fstab`, so the server also boots without the disk.
2. Stop the server in the panel (Servers, the server, Stop) and wait until it shows Stopped.
3. Detach the disk in the panel (Servers, the server, its Block Storage tab), or let the destroy run. Take a snapshot of the disk first if the data matters.
4. Start the server again if it is still needed.

The panel says the same in the Block Storage tab (`apps/web/messages/extras-en.ts`, the detach note). Never detach a mounted disk: data that was not written out is lost.

## End-of-subscription destroy refused because the server runs (operations)

The disk's subscription ended and its destroy was approved (see [lifecycle-approval.md](lifecycle-approval.md)), but the server it is attached to has a subscription of its own and is running.

Safe checks:

1. On `/operations`, the disk's `destroy` is `needs_attention` with `conflict`. The disk's final snapshot (`final_snapshot` of the same disk) is `succeeded`. If it is not, do not go on (R13).
2. The server is the customer's and is running for a reason of its own (its subscription is active). Never stop a customer's server, from the admin app or from the console, to let the destroy pass: that is an outage the customer did not ask for.

Steps:

1. Support writes to the customer (support request or e-mail): the disk's subscription has ended, its data is kept in the final snapshot, and the disk will be removed; please unmount it (`sudo umount <mount point>`, remove the `/etc/fstab` line) and stop the server once, at a time that suits them, or detach the disk in the panel.
2. When the server is stopped (or the disk is detached), `retryOperation` on the disk's `destroy` with a reason (for example "customer stopped the server, ticket <id>"). The destroy detaches the disk, waits for the detach, and deletes it.
3. If the customer does not answer: leave the operation in `needs_attention` and write a Needs decision in JOURNEY.md for the owner (the attached disk keeps costing TiCON its monthly price while it exists). `rejectOperation` on a destroy deletes nothing and only ends the attempt; it is not a way to remove the disk.
4. The server's own end of subscription stops it (suspension), after which a retry of the disk's destroy goes through.

## A server destroyed with its disks (WPU-Y4)

Owner decision 2026-11-14: "if server destroyed then the disk also needs to be deleted". AWS: deleting a Lightsail instance does not delete its attached disks (they remain and are billed), DeleteDisk needs a disk that is not attached, and DetachDisk needs a stopped instance (user guide and API reference, read 2026-11-14).

What the platform does:

1. When a server's subscription becomes `retained` (the end of its grace, the unpaid rule, or the customer's own destroy), every disk attached to it (`resources.config.attachedInstanceId`) is retained in the same transaction: its subscription ends with the server's, so it is never renewed or charged again, and its `final_snapshot` and `destroy` are queued with the payload `withServer` = the server's id. Before 2026-12-01 both destroys wait in `needs_approval` (R13).
2. The server's `destroy` (step `release_disks`) sees a block storage disk still attached: it stops the server (the stop is part of the approved destroy) and waits, at most 24 hours from its own first wait, until the disks are detached. It never sends DeleteInstance while a disk is attached.
3. The disk's `destroy` (step `wait_server`) waits, at most 24 hours from its own first wait, until the server is stopped, then detaches the disk and deletes it. It never stops a server itself.
4. Then the server's destroy deletes the instance and releases its static IP.
5. A server that leaves `retained` (the customer pays the unpaid usage, or a restore) gives its disks back in the same transaction: each disk subscription gets its former status (`active` or `grace`, kept in the disk's mark `retainedWithServer` and in the destroy's payload `from`), its destroy and final snapshot that never started are cancelled, its final backups stop being final, and the mark goes. Nothing is posted to the ledger. Every other destroy and final snapshot of the disk (queued, waiting, needs_approval, needs_attention, approved or not) is ended (`failed`, "cancelled: the server was revived") in the same transaction, under the lock of its row. Only a disk whose destroy is running, reached the DeleteDisk step or succeeded stays `retained`: an attention item appears in discrepancies (`missing`, source `attached_disks`, reason `disk_destroy_may_have_run`). Check the disk in the pool account read-only, then write a Needs decision. A later retention of the server in the same period queues new operations for the disk (key `...:after:<id>`), never the cancelled ones.
6. While a disk's server is in `grace` or `retained`, the disk is not renewed and not charged (mark `serverHold`); the mark goes when the server is `active` again and the disk's period end is then handled as usual.

Operations:

1. Approve the server's `final_snapshot` and `destroy` and every attached disk's `final_snapshot` and `destroy` together (`/operations`, same customer, the disk rows name `withServer`). Approving only the server leaves its destroy waiting for the disks; it ends `needs_attention` with `conflict` after 24 hours and nothing is deleted.
2. A server destroy in `needs_attention` with `conflict` at step `release_disks`: check the disk destroys of the same server. Approve them (or `retryOperation` a disk destroy that is in `needs_attention`), and once each disk shows `destroyed`, `retryOperation` the server's destroy with a reason.
3. A disk destroy in `needs_attention` with `conflict` at step `wait_server`: the server did not stop within 24 hours. Check the server's destroy (approved? running?). When the server is stopped, `retryOperation` the disk's destroy.
4. A disk the customer wants to keep: it must be detached before the server's subscription is retained (Storage tab or `/servers/disks`). Once retained, it is destroyed with the server; its final backup can make a new disk (`/servers/disk-restore`).

## Rollback

Nothing to undo: a refused detach or destroy changed nothing in AWS. A disk detached by mistake is attached again from the panel (Attach, the same server) while the server is stopped or running.

## What to log

In the support request or ticket: the operation ids, the date the customer was asked, the date the server was stopped, and the reason given with `retryOperation`. Never the customer's data, a key or an account id (R14).

## Must not

- Never stop, reboot or detach anything in the Lightsail console of a pool account by hand.
- Never `rejectOperation` a destroy to "clean up" and never delete the disk in the console.
- Never approve a destroy without the final snapshot where the family has one (R13).
- A reject of a destroy whose subscription is `retained` (server or disk) writes an attention item (`missing`, source `admin_reject`, reason `retention_destroy_rejected`): the subscription is then retained with no live destroy, so decide what happens to the resource and write a Needs decision.
- Never reject a disk's destroy that names `withServer` while the server's destroy is approved: the server's destroy then waits for that disk and ends in `needs_attention`.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
