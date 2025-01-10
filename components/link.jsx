import * as Headless from '@headlessui/react';
import NextLink from 'next/link';
import React from 'react';

export const Link = React.forwardRef((props, ref) => {
  return (
    <Headless.DataInteractive>
      <NextLink {...props} ref={ref} />
    </Headless.DataInteractive>
  );
});
