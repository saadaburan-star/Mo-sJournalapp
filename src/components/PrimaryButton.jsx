import './PrimaryButton.css';

/** Square, uppercase condensed, accent-filled. The primary action, once. */
export default function PrimaryButton({ variant = 'default', className = '', ...props }) {
  const classes = [
    'primary-button',
    variant === 'lock' ? 'primary-button--lock' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button type="button" className={classes} {...props} />;
}
