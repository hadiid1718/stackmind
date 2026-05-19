import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, MailPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import ConfirmRemoveMemberModal from '../components/team/ConfirmRemoveMemberModal';
import InviteMemberModal from '../components/team/InviteMemberModal';
import TeamMemberTable from '../components/team/TeamMemberTable';
import { formatDateTime } from '../lib/dateFormatters';
import orgService from '../services/orgService';
import useOrg from '../hooks/useOrg';

const mapMember = (membership) => ({
  memberId: membership?.user?._id || membership?.user || membership?._id,
  name: membership?.user?.name || '',
  email: membership?.email || membership?.user?.email || '-',
  role: membership?.role || 'member',
  joinedAt: membership?.joinedAt,
});

const countdownLabel = (expiresAt, now) => {
  const diff = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(diff) || diff <= 0) return 'Expired';

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

const TeamSettings = () => {
  const { organisations, currentOrg, setActiveOrg, selectOrgPending } = useOrg();
  const activatedOrgRef = useRef(null);
  const [contextReady, setContextReady] = useState(false);
  const [members, setMembers] = useState([]);
  const [openInviteModal, setOpenInviteModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const activateContext = async () => {
      if (!currentOrg?.org_id) {
        activatedOrgRef.current = null;
        if (mounted) setContextReady(false);
        return;
      }

      if (activatedOrgRef.current === currentOrg.org_id) {
        if (mounted) setContextReady(true);
        return;
      }

      const activated = await setActiveOrg(currentOrg);

      if (mounted) {
        if (!activated) {
          setContextReady(false);
          return;
        }

        activatedOrgRef.current = currentOrg.org_id;
        setContextReady(true);
      }
    };

    void activateContext();
    return () => {
      mounted = false;
    };
  }, [currentOrg, setActiveOrg]);

  const membersQuery = useQuery({
    queryKey: ['team-members', currentOrg?.org_id],
    queryFn: () => orgService.listMembers(currentOrg.org_id),
    enabled: Boolean(currentOrg?.org_id) && contextReady,
  });

  useEffect(() => {
    const rows = membersQuery.data?.memberships || [];
    setMembers(rows.map(mapMember));
  }, [membersQuery.data]);

  const inviteMutation = useMutation({
    mutationFn: (payload) => orgService.inviteMember({ orgId: currentOrg.org_id, ...payload }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }) => orgService.updateMemberRole({ orgId: currentOrg.org_id, memberId, role }),
  });

  const removeMutation = useMutation({
    mutationFn: ({ memberId }) => orgService.removeMember({ orgId: currentOrg.org_id, memberId }),
  });

  const roleUpdatingId = roleMutation.variables?.memberId || null;

  const handleRoleChange = async (member, role) => {
    if (member.role === role) return;

    const canUpdate = await ensureOrgContext();
    if (!canUpdate) {
      return;
    }

    const previous = members;
    setMembers((value) => value.map((item) => (item.memberId === member.memberId ? { ...item, role } : item)));

    try {
      await roleMutation.mutateAsync({ memberId: member.memberId, role });
      await membersQuery.refetch();
      setFeedback(`Role updated for ${member.email}.`);
    } catch (error) {
      setMembers(previous);
      setFeedback(error?.response?.data?.message || 'Unable to update role.');
    }
  };

  const ensureOrgContext = async () => {
    if (!currentOrg?.org_id) {
      setFeedback('Select an organisation before inviting members.');
      return false;
    }

    if (contextReady) {
      return true;
    }

    const activated = await setActiveOrg(currentOrg);
    if (!activated) {
      setFeedback('Organisation context is not ready. Please try again.');
      return false;
    }

    activatedOrgRef.current = currentOrg.org_id;
    setContextReady(true);
    return true;
  };

  const handleInvite = async ({ email, role }) => {
    setFeedback('');
    const canInvite = await ensureOrgContext();
    if (!canInvite) {
      throw new Error('Organisation context is required');
    }

    try {
      const response = await inviteMutation.mutateAsync({ email, role });
      const invitation = response?.invitation;
      const invitationToken = response?.invitationToken;
      const fallbackExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const appInviteLink = `${window.location.origin}/invite/${invitationToken || ''}`;

      setPendingInvites((value) => [
        {
          email,
          role,
          createdAt: invitation?.createdAt || new Date().toISOString(),
          expiresAt: invitation?.expiresAt || fallbackExpiry,
          invitationLink: appInviteLink,
          apiInviteUrl: response?.invitationUrl || '',
        },
        ...value,
      ]);
      await membersQuery.refetch();
      setFeedback(`Invitation sent to ${email}.`);
    } catch (error) {
      setFeedback(error?.response?.data?.message || 'Unable to send invitation.');
      throw error;
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;

    const canRemove = await ensureOrgContext();
    if (!canRemove) {
      return;
    }

    try {
      await removeMutation.mutateAsync({ memberId: removeTarget.memberId });
      setMembers((value) => value.filter((member) => member.memberId !== removeTarget.memberId));
      setFeedback(`${removeTarget.email} removed from this view.`);
      setRemoveTarget(null);
    } catch (error) {
      setFeedback(error?.response?.data?.message || 'Unable to remove member.');
    }
  };

  const activeOrgLabel = useMemo(() => {
    if (currentOrg?.name) return currentOrg.name;
    if (organisations[0]?.name) return organisations[0].name;
    return 'No active organisation';
  }, [currentOrg, organisations]);

  return (
    <div className="space-y-6">
      <Card title="Organisation & Team" description="Manage members, roles, and invitations.">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-text3">Active organisation</p>
            <p className="text-sm font-medium text-text">{activeOrgLabel}</p>
          </div>
          <Button type="button" onClick={() => setOpenInviteModal(true)} disabled={selectOrgPending}>
            <MailPlus size={16} className="mr-2" />
            Invite member
          </Button>
        </div>

        <div className="mb-3 flex items-center gap-2 text-text2">
          <Users size={16} />
          <span className="text-sm font-medium">Team members</span>
        </div>

        <TeamMemberTable
          members={members}
          roleUpdatingId={roleUpdatingId}
          onRoleChange={handleRoleChange}
          onRemoveMember={setRemoveTarget}
        />

        {membersQuery.isLoading ? <p className="mt-3 text-sm text-text3">Loading members...</p> : null}
        {membersQuery.isError ? (
          <p className="mt-3 text-sm text-warning">{membersQuery.error?.response?.data?.message || 'Could not load members for current context.'}</p>
        ) : null}
      </Card>

      <Card title="Pending invites" description="Invitations expire in 48 hours.">
        {pendingInvites.length === 0 ? <p className="text-sm text-text3">No pending invitations yet.</p> : null}

        <div className="space-y-3">
          {pendingInvites.map((invite) => (
            <div key={`${invite.email}-${invite.expiresAt}`} className="rounded-lg border border-border bg-bg3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-text">{invite.email}</p>
                  <p className="text-xs text-text3">Role: {invite.role}</p>
                </div>
                <Badge tone={countdownLabel(invite.expiresAt, now) === 'Expired' ? 'error' : 'warning'}>
                  {countdownLabel(invite.expiresAt, now)}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text3">
                <span>Created: {formatDateTime(invite.createdAt)}</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={async () => {
                    const text = invite.invitationLink || invite.apiInviteUrl;
                    if (!text) return;
                    try {
                      await navigator.clipboard.writeText(text);
                      setFeedback(`Copied invite link for ${invite.email}.`);
                    } catch {
                      setFeedback('Could not copy invite link.');
                    }
                  }}
                >
                  <Copy size={13} className="mr-1" />
                  Copy invite link
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {feedback ? <p className="text-sm text-text2">{feedback}</p> : null}

      <InviteMemberModal
        open={openInviteModal}
        onClose={() => setOpenInviteModal(false)}
        onInvite={handleInvite}
        isSubmitting={inviteMutation.isPending}
      />

      <ConfirmRemoveMemberModal
        open={Boolean(removeTarget)}
        member={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        isSubmitting={removeMutation.isPending}
      />
    </div>
  );
};

export default TeamSettings;

