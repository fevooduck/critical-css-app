"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Copy,
	Download,
	Loader2,
	Monitor,
	Smartphone,
	Zap,
	CheckCircle,
	XCircle,
	Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CriticalConfig {
	width: number;
	height: number;
	device: "desktop" | "mobile";
	name: string;
}

interface CriticalResult {
	config: CriticalConfig;
	css: string;
	success: boolean;
	error?: string;
}

const presetConfigs: Record<string, CriticalConfig> = {
	"desktop-1920": {
		width: 1920,
		height: 1080,
		device: "desktop",
		name: "Desktop 1920×1080",
	},
	"desktop-1366": {
		width: 1366,
		height: 768,
		device: "desktop",
		name: "Desktop 1366×768",
	},
	"desktop-1280": {
		width: 1280,
		height: 720,
		device: "desktop",
		name: "Desktop 1280×720",
	},
	"mobile-375": {
		width: 375,
		height: 667,
		device: "mobile",
		name: "iPhone SE",
	},
	"mobile-414": {
		width: 414,
		height: 896,
		device: "mobile",
		name: "iPhone 11 Pro Max",
	},
	"mobile-360": {
		width: 360,
		height: 640,
		device: "mobile",
		name: "Android Small",
	},
	"tablet-768": {
		width: 768,
		height: 1024,
		device: "desktop",
		name: "iPad Portrait",
	},
	"tablet-1024": {
		width: 1024,
		height: 768,
		device: "desktop",
		name: "iPad Landscape",
	},
};

export default function CriticalCSSApp() {
	const [url, setUrl] = useState("");
	const [selectedConfigs, setSelectedConfigs] = useState<string[]>([
		"desktop-1280",
		"mobile-375",
	]);
	const [results, setResults] = useState<CriticalResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const { toast } = useToast();

	const handleConfigToggle = (configKey: string) => {
		setSelectedConfigs((prev) =>
			prev.includes(configKey)
				? prev.filter((key) => key !== configKey)
				: [...prev, configKey],
		);
	};

	const selectAllDesktop = () => {
		const desktopConfigs = Object.entries(presetConfigs)
			.filter(([_, config]) => config.device === "desktop")
			.map(([key]) => key);

		setSelectedConfigs((prev) => {
			const withoutDesktop = prev.filter(
				(key) => presetConfigs[key]?.device !== "desktop",
			);
			return [...withoutDesktop, ...desktopConfigs];
		});
	};

	const selectAllMobile = () => {
		const mobileConfigs = Object.entries(presetConfigs)
			.filter(([_, config]) => config.device === "mobile")
			.map(([key]) => key);

		setSelectedConfigs((prev) => {
			const withoutMobile = prev.filter(
				(key) => presetConfigs[key]?.device !== "mobile",
			);
			return [...withoutMobile, ...mobileConfigs];
		});
	};

	const handleGenerate = async () => {
		if (!url) {
			setError("Please enter a valid URL");
			return;
		}

		if (selectedConfigs.length === 0) {
			setError("Please select at least one device configuration");
			return;
		}

		setIsLoading(true);
		setError("");
		setResults([]);

		try {
			const configs = selectedConfigs.map((key) => presetConfigs[key]);

			const response = await fetch("/api/critical", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					url,
					configs,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to generate critical CSS");
			}

			setResults(data.results);

			const successCount = data.results.filter(
				(r: CriticalResult) => r.success,
			).length;
			const totalCount = data.results.length;

			toast({
				title: "Generation Complete!",
				description: `${successCount}/${totalCount} configurations processed successfully`,
			});
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "An error occurred";
			setError(errorMessage);
			toast({
				title: "Error",
				description: errorMessage,
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleCopy = async (css: string, configName: string) => {
		try {
			await navigator.clipboard.writeText(css);
			toast({
				title: "Copied!",
				description: `${configName} CSS copied to clipboard`,
			});
		} catch (err) {
			toast({
				title: "Error",
				description: "Failed to copy to clipboard",
				variant: "destructive",
			});
		}
	};

	const handleDownload = (css: string, configName: string) => {
		const blob = new Blob([css], { type: "text/css" });
		const downloadUrl = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = downloadUrl;
		a.download = `critical-${configName
			.toLowerCase()
			.replace(/\s+/g, "-")}.css`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(downloadUrl);

		toast({
			title: "Downloaded!",
			description: `${configName} CSS file downloaded`,
		});
	};

	const handleDownloadAll = () => {
		const successfulResults = results.filter((r) => r.success);

		if (successfulResults.length === 0) return;

		successfulResults.forEach((result) => {
			handleDownload(result.css, result.config.name);
		});
	};

	const desktopConfigs = Object.entries(presetConfigs).filter(
		([_, config]) => config.device === "desktop",
	);
	const mobileConfigs = Object.entries(presetConfigs).filter(
		([_, config]) => config.device === "mobile",
	);

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
			<div className="max-w-6xl mx-auto space-y-6">
				<div className="text-center space-y-2">
					<div className="flex items-center justify-center gap-2">
						<Zap className="w-8 h-8 text-blue-600" />
						<h1 className="text-3xl font-bold text-gray-900">
							Critical CSS Generator
						</h1>
					</div>
					<p className="text-gray-600">
						Extract critical above-the-fold CSS for multiple devices to improve
						page load performance
					</p>
				</div>

				<Alert>
					<Info className="h-4 w-4" />
					<AlertDescription>
						This demo uses a mock CSS generator for demonstration purposes. In a
						production environment, this would connect to the actual Critical
						library to analyze real websites.
					</AlertDescription>
				</Alert>

				<Card>
					<CardHeader>
						<CardTitle>Configuration</CardTitle>
						<CardDescription>
							Enter a URL and select multiple device configurations to generate
							critical CSS
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-2">
							<Label htmlFor="url">Website URL</Label>
							<Input
								id="url"
								type="url"
								placeholder="https://example.com"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
							/>
						</div>

						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label className="text-base font-medium">
									Device Configurations
								</Label>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={selectAllDesktop}
									>
										<Monitor className="w-4 h-4 mr-1" />
										All Desktop
									</Button>
									<Button variant="outline" size="sm" onClick={selectAllMobile}>
										<Smartphone className="w-4 h-4 mr-1" />
										All Mobile
									</Button>
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Monitor className="w-5 h-5 text-blue-600" />
										<h3 className="font-medium">Desktop & Tablet</h3>
									</div>
									<div className="space-y-2">
										{desktopConfigs.map(([key, config]) => (
											<div
												key={key}
												className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50"
											>
												<Checkbox
													id={key}
													checked={selectedConfigs.includes(key)}
													onCheckedChange={() => handleConfigToggle(key)}
												/>
												<label htmlFor={key} className="flex-1 cursor-pointer">
													<div className="font-medium">{config.name}</div>
													<div className="text-sm text-gray-500">
														{config.width} × {config.height}
													</div>
												</label>
												<Badge variant="default">Desktop</Badge>
											</div>
										))}
									</div>
								</div>

								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Smartphone className="w-5 h-5 text-green-600" />
										<h3 className="font-medium">Mobile</h3>
									</div>
									<div className="space-y-2">
										{mobileConfigs.map(([key, config]) => (
											<div
												key={key}
												className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50"
											>
												<Checkbox
													id={key}
													checked={selectedConfigs.includes(key)}
													onCheckedChange={() => handleConfigToggle(key)}
												/>
												<label htmlFor={key} className="flex-1 cursor-pointer">
													<div className="font-medium">{config.name}</div>
													<div className="text-sm text-gray-500">
														{config.width} × {config.height}
													</div>
												</label>
												<Badge variant="secondary">Mobile</Badge>
											</div>
										))}
									</div>
								</div>
							</div>

							<div className="text-sm text-gray-600">
								Selected: {selectedConfigs.length} configuration
								{selectedConfigs.length !== 1 ? "s" : ""}
							</div>
						</div>

						<Button
							onClick={handleGenerate}
							disabled={isLoading || !url || selectedConfigs.length === 0}
							className="w-full"
							size="lg"
						>
							{isLoading ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Generating Critical CSS for {selectedConfigs.length} device
									{selectedConfigs.length !== 1 ? "s" : ""}
									...
								</>
							) : (
								<>
									<Zap className="w-4 h-4 mr-2" />
									Generate Critical CSS ({selectedConfigs.length} device
									{selectedConfigs.length !== 1 ? "s" : ""})
								</>
							)}
						</Button>

						{error && (
							<div className="p-4 bg-red-50 border border-red-200 rounded-md">
								<p className="text-red-800 text-sm">{error}</p>
							</div>
						)}
					</CardContent>
				</Card>

				{results.length > 0 && (
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Generated Critical CSS</CardTitle>
									<CardDescription>
										Critical CSS generated for {results.length} device
										configuration{results.length !== 1 ? "s" : ""}
									</CardDescription>
								</div>
								<Button
									variant="outline"
									onClick={handleDownloadAll}
									disabled={!results.some((r) => r.success)}
								>
									<Download className="w-4 h-4 mr-2" />
									Download All
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<Accordion type="multiple" className="w-full">
								{results.map((result, index) => (
									<AccordionItem key={index} value={`item-${index}`}>
										<AccordionTrigger className="hover:no-underline">
											<div className="flex items-center gap-3 text-left">
												{result.success ? (
													<CheckCircle className="w-5 h-5 text-green-500" />
												) : (
													<XCircle className="w-5 h-5 text-red-500" />
												)}
												<div>
													<div className="font-medium">
														{result.config.name}
													</div>
													<div className="text-sm text-gray-500">
														{result.config.width} × {result.config.height}
														{result.success
															? ` • ${Math.round(result.css.length / 1024)}KB`
															: ` • Failed`}
													</div>
												</div>
												<Badge
													variant={
														result.config.device === "mobile"
															? "secondary"
															: "default"
													}
												>
													{result.config.device}
												</Badge>
											</div>
										</AccordionTrigger>
										<AccordionContent>
											{result.success ? (
												<div className="space-y-4">
													<div className="flex gap-2">
														<Button
															variant="outline"
															size="sm"
															onClick={() =>
																handleCopy(result.css, result.config.name)
															}
														>
															<Copy className="w-4 h-4 mr-2" />
															Copy
														</Button>
														<Button
															variant="outline"
															size="sm"
															onClick={() =>
																handleDownload(result.css, result.config.name)
															}
														>
															<Download className="w-4 h-4 mr-2" />
															Download
														</Button>
													</div>
													<Textarea
														value={result.css}
														readOnly
														className="min-h-[200px] font-mono text-sm"
														placeholder="Critical CSS will appear here..."
													/>
												</div>
											) : (
												<div className="p-4 bg-red-50 border border-red-200 rounded-md">
													<p className="text-red-800 text-sm">
														<strong>Error:</strong>{" "}
														{result.error || "Unknown error occurred"}
													</p>
												</div>
											)}
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>

							<div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
								<h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
								<ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
									<li>Copy the generated CSS for each device type</li>
									<li>
										Inline the appropriate CSS in your HTML {"<head>"} based on
										device detection
									</li>
									<li>Load your full CSS asynchronously or defer it</li>
									<li>
										Test your page load performance improvements across devices
									</li>
								</ol>
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
