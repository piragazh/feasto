import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Award, Facebook, Instagram, Twitter, Globe, Award as TrophyIcon, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RestaurantProfileSection({ restaurant }) {
    const socialIcons = {
        facebook: Facebook,
        instagram: Instagram,
        twitter: Twitter,
        website: Globe
    };

    const hasSocialMedia = restaurant.social_media && Object.values(restaurant.social_media).some(link => link);
    const hasAwards = restaurant.awards_certifications && restaurant.awards_certifications.length > 0;

    return (
        <div className="space-y-6">
            {/* About Us */}
            {restaurant.about_us && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-orange-500" />
                            About Us
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                            {restaurant.about_us}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Our Story */}
            {restaurant.our_story && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-blue-500" />
                            Our Story
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                            {restaurant.our_story}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Awards & Certifications */}
            {hasAwards && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrophyIcon className="h-5 w-5 text-yellow-500" />
                            Awards & Certifications
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 gap-4">
                            {restaurant.awards_certifications.map((award, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg p-4 border border-yellow-200"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Award className="h-5 w-5 text-yellow-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-900">{award.title}</h4>
                                            {award.issuer && (
                                                <p className="text-sm text-gray-600 mt-1">by {award.issuer}</p>
                                            )}
                                            {award.year && (
                                                <Badge className="mt-2 bg-yellow-500 text-white">
                                                    {award.year}
                                                </Badge>
                                            )}
                                            {award.description && (
                                                <p className="text-sm text-gray-600 mt-2">{award.description}</p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Social Media */}
            {hasSocialMedia && (
                <Card>
                    <CardHeader>
                        <CardTitle>Connect With Us</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(restaurant.social_media || {}).map(([platform, url]) => {
                                if (!url) return null;
                                const Icon = socialIcons[platform] || Globe;
                                return (
                                    <a
                                        key={platform}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                    >
                                        <Icon className="h-5 w-5 text-gray-700" />
                                        <span className="text-sm font-medium capitalize">{platform}</span>
                                        <ExternalLink className="h-3 w-3 text-gray-500" />
                                    </a>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}