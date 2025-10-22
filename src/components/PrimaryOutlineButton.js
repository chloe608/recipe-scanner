import React from 'react';

const PrimaryOutlineButton = ({ children, onClick, disabled, className = '', type = 'button' }) => {
  const classes = ('primary-outline ' + className).trim();
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

export default PrimaryOutlineButton;
