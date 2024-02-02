declare module "*.svg" {
	import React from "react";
	const Component: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	export = Component;
}
