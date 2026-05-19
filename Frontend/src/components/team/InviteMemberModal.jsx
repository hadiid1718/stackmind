import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Button from '../Button';
import Input from '../Input';
import Modal from '../Modal';

const inviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: z.enum(['owner', 'admin', 'member', 'viewer'], { message: 'Role is required' }),
});

const InviteMemberModal = ({ open, onClose, onInvite, isSubmitting }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'member',
    },
  });

  const submit = async (values) => {
    try {
      await onInvite(values);
      reset();
      onClose();
    } catch {
      // Keep modal open so users can fix and retry.
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite team member">
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <Input label="Email" type="email" placeholder="teammate@company.com" error={errors.email?.message} {...register('email')} />

        <label className="block text-sm text-text2">
          <span className="mb-1 block font-medium">Role</span>
          <select
            className="w-full rounded-lg border border-border bg-bg3 px-3 py-2 text-sm text-text outline-none ring-brand transition focus:border-border-strong focus:ring-1"
            {...register('role')}
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          {errors.role?.message ? <span className="mt-1 block text-xs text-error">{errors.role.message}</span> : null}
        </label>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending invite...' : 'Send invite'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default InviteMemberModal;

